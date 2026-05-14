# Available Restaurants Dashboard Flow

This document details the architectural execution flow, caching strategies, and business logic surrounding the `available-restaurants-dashboard` API endpoint, based strictly on the current backend codebase implementation.

## 1. Controller Layer (`RestaurantController`)
Endpoint: `GET /api/restaurants/available-restaurants-dashboard`

The flow begins when the client requests dashboard data. The controller orchestrates the retrieval of up to four distinct categories of restaurants to populate the UI.

1.  **Initial Fetch**: It first retrieves a "normal" or default page of available restaurants (`sort = "default"`) based on user coordinates (`lat`, `lng`).
2.  **Conditional Fetching**: If the total number of branches returned in the initial fetch exceeds 10, the controller initiates three additional queries to build specialized dashboard sections:
    -   **Top Rated**: Uses default criteria (`sort = null`, falling back to default sorting behavior internally).
    -   **Fastest**: Sorted by delivery time (`sort = "delivery_time"`).
    -   **Trending**: Sorted by trending status (`sort = "trending"`).
3.  **Response Construction**: It aggregates these four lists into a `RestaurantDashboardDTO` which is returned as a JSON response.

## 2. Service Layer & Geospatial Filtering (`RestaurantServiceImpl`)
Method: `findAvailableRestaurants(...)`

For each of the dashboard category calls, the service performs the following geospatial validation and processing:

1.  **Coordinate Resolution**: It determines the exact latitude and longitude either from the authenticated user's saved `deliveryLocation` or from the request parameters (for guest users).
2.  **Redis Spatial Search**: To narrow down the search space rapidly, it queries Redis using `GeoOperations`. It searches within an 8km radius (`MAX_SYSTEM_DELIVERY_RADIUS_KM`) around the user's location in the `restaurant:locations` index.
3.  **Branch ID Extraction**: It extracts the IDs of branches (`nearbyBranchIds`) that fall within this physical radius. If none are found, it immediately returns an empty page.
4.  **Cache Delegation**: It delegates the actual database query to the `RestaurantQueryCacheService`, passing the requested sorting method, pagination, precise coordinates, and the list of nearby branch IDs.

## 3. Caching & Database Querying (`RestaurantQueryCacheService`)
Method: `getCachedDashboardPage(...)`

This layer heavily utilizes Spring Cache (backed by Redis) to reduce load on the database.

**Cache Configuration:**
-   **Cache Name**: `dashboardRestaurants`
-   **Cache Key**: `"#sort + ':' + #pageable.pageNumber + ':' + #roundedLat + ',' + #roundedLng"`
-   **Condition**: Caches only if data is returned (`unless = "#result.content.isEmpty()"`). The `roundedLat` and `roundedLng` ensure users in roughly the same grid area share the same cache entry for restaurant discovery.

**Execution Logic (On Cache Miss):**
1.  **Dynamic Querying**: It executes a `switch` statement on the `sort` parameter (e.g., "rating", "prep_time", "delivery_time", "trending"). Each case calls a specific dynamic sorting method on the `RestaurantRepository`.
2.  **Branch Validation**: Before mapping to DTOs, it filters out invalid branches (e.g., branches with no manager, inactive branches, closed branches, or branches outside the `nearbyBranchIds` list).
3.  **DTO Mapping & Serialization**: It invokes the `RestaurantDtoMapper` to construct the DTOs and wraps the final result in a `SerializablePage` to allow safe storage within Redis.

## 4. DTO Construction & Filtering (`RestaurantDtoMapper`)
Method: `mapToSummaryDto(...)`

During the mapping process, the system dynamically calculates the real-time delivery feasibility and costs for the user.

1.  **Delivery Calculation**: For each valid branch belonging to a restaurant, it calls `PricingService.calculateDeliveryInfo(branch, userLatitude, userLongitude)`.
2.  **Deliverability Filtering**: Branches are rigorously filtered. Only those where `deliveryInfo.isDeliverable()` returns `true` are retained.
3.  **Data Population**: The resulting `BranchSummaryDto` is populated with precise, calculated fields including `deliveryPrice`, `deliveryTime`, `distanceInKm`, and a dynamic `isTrending` flag (set to true if daily orders exceed 10).
4.  **Rounding Review Counts**: To provide a cleaner UI, review counts are rounded dynamically (exact for <10, nearest 10 for <100, nearest 100 for >=100).

## 5. Pricing and Delivery Logic (`PricingService`)
Method: `calculateDeliveryInfo(...)`

This service is the source of truth for routing, pricing, and timing calculations.

1.  **Cache Key Generation**: It generates a `userLocationKey` by reducing coordinate precision to roughly a 250m-400m block (`precision = 250`). This prevents excessive identical API calls for users standing near each other.
2.  **Distance Retrieval**: It delegates the actual route calculation to `DistanceMatrixService`.
3.  **Deliverability Rules**: A branch is considered deliverable ONLY if all three conditions are met:
    -   The branch is currently open.
    -   A valid route exists (`distanceInMeters != -1`).
    -   The actual road distance is less than or equal to the branch's defined delivery radius (`branch.getDeliveryRadiusInKm()`).
4.  **Time & Price Computation**: If deliverable:
    -   **Time**: Calculated by adding the branch's average prep time, the Google API travel time, and a 5-10 minute courier buffer, then rounding to the nearest 5 minutes (e.g., "25-30 min").
    -   **Price**: Calculated using tiered pricing based on the actual road distance (e.g., <=1.5km = 80, <=3.0km = 150, <=5.0km = 200).

## 6. External API Integration (`DistanceMatrixService`)
Method: `getDistanceMatrix(...)`

This service handles the actual communication with the Google Maps Distance Matrix API.

-   **Caching**: To optimize costs and speed, this layer is also cached individually (`@Cacheable(value = "distanceMatrix")`). The key explicitly binds a branch to a rounded user location block (`"'branch:' + #restaurantBranchId + ':loc:' + #userLocationKey"`).
-   **API Call**: It requests driving distances (`TravelMode.DRIVING`) using the metric system.
-   **Error Handling**: If the API fails or returns invalid results, it logs the error and gracefully returns a fallback object with values set to `-1L`, which is later interpreted by the `PricingService` as an invalid/undeliverable route.
