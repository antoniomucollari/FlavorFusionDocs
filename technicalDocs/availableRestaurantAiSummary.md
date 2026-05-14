# Available Restaurants Dashboard Flow

This document outlines the architectural flow and caching strategy for the `available-restaurants-dashboard` API, which is responsible for fetching and serving restaurant data to the frontend dashboard.

## Overview of the Flow

The process begins when a request is made to the `available-restaurants-dashboard` endpoint. This request is handled by the `restaurantController`, which orchestrates the retrieval of categorized restaurant data.

### 1. Controller Layer (`restaurantController`)
The controller's `getDashboardData()` method is the entry point. To populate the dashboard with different categories of restaurants, it makes multiple calls to the `RestaurantService.findAvailableRestaurants(...)` method. Specifically, it fetches data for the following categories using different `sort` parameters:
- `default`
- `topRated`
- `delivery_time` (Fastest)
- `trending`

### 2. Service Layer (`RestaurantServiceImpl`)
For each category requested by the controller, the `findAvailableRestaurants` method in `RestaurantServiceImpl` executes the following steps:
1.  **Geospatial Setup**: It generates a search radius and constructs a user point using `org.springframework.data.geo.Point`.
2.  **Search Circle**: It creates a `Circle searchCircle = new Circle(userPoint, searchRadius)`.
3.  **Cache/Data Retrieval**: It delegates the actual data fetching to the `RestaurantQueryCacheService` by calling `getCachedDashboardPage(...)`, passing the sorting criteria, pagination details, exact coordinates, search circle, and filtering criteria.
4.  **Response Formatting**: It receives a serializable cached result and converts it back to a Spring `Page` object before returning it to the controller.

### 3. Caching Layer (`RestaurantQueryCacheService`)
The `getCachedDashboardPage` method is heavily optimized using Redis caching to minimize database and external API load.

**Cache Configuration (`@Cacheable`):**
-   **Cache Name**: `dashboardRestaurants`
-   **Cache Key**: Constructed using a combination of the sort parameter, page number, and rounded user coordinates (`#sort + ':' + #pageable.pageNumber + ':' + #roundedLat + ',' + #roundedLng`). Rounding the coordinates ensures that nearby users share the same cache entries, significantly increasing the cache hit rate.
-   **Condition**: Caches are only created if the result is not empty (`unless = "#result.content.isEmpty()"`).

**Execution Logic:**
-   **Cache Hit**: If the requested data exists in the cache for the specific sort and location grid, it is returned immediately.
-   **Cache Miss**: If not found in the cache, the service queries the database via `restaurantRepository`. It uses dynamic repository methods based on the `sort` string (e.g., finding by rating for `topRated`, finding by drop time for `delivery_time`, or trending).
-   After fetching from the database, it processes each restaurant by calling `mapToSummaryDto` in the `RestaurantDtoMapper`.

### 4. DTO Mapping and Filtering (`RestaurantDtoMapper`)
During the mapping process (`mapToSummaryDto`), the system needs to determine the exact distance and delivery time for each specific user.
1.  It maps the database entity to a `RestaurantSummaryDto`.
2.  It proceeds to find the exact distance in meters and time in seconds.
3.  It filters the restaurants by determining if they are `isDeliverable`. This is evaluated based on the result returned from the `PricingService`.

### 5. Pricing and Delivery Info (`PricingService`)
The mapper calls `PricingService.calculateDeliveryInfo()`. This method is designed to return a comprehensive `DeliveryInfo` object containing:
-   `BigDecimal deliveryFee`
-   `String deliveryTime`
-   `double distanceInKm`
-   `long distanceInMeters`
-   `long durationInSeconds`
-   `boolean isDeliverable`

*Note: While the mapper might not need all these fields, it reuses this centralized method to obtain the necessary distance, time, and deliverability status, as other services also rely on this structured data.*

### 6. External API Integration (`DistanceMatrixService`)
To calculate accurate delivery information, `PricingService` calls `DistanceMatrixService.getDistanceMatrix(...)`.
-   This service is responsible for calling an external distance matrix API (like Google Maps Distance Matrix).
-   **Caching**: To prevent excessive API calls and reduce latency, this method is also cached (`@Cacheable(value="distanceMatrix")`). The cache key is highly specific: `#branch:' + #restaurantBranchId + ':loc:' + #userLocationKey`.
-   **Cached Object**: The result is saved as a serializable `DistanceMatrixInfo` object containing `distanceInMeters` and `durationInSeconds`.

## Summary
This architecture provides a robust, multi-tiered caching strategy. It utilizes a broad grid-based cache for overall restaurant discovery (`dashboardRestaurants`) and a highly specific point-to-point cache for distance calculations (`distanceMatrix`), ensuring fast response times while maintaining accurate delivery constraints and pricing.
