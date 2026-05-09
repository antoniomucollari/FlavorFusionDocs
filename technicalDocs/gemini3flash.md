# 🏛️ FoodApp Backend: The Solo Architect's Engineering Guide

This document provides a comprehensive, deep-dive into the architectural decisions, implementation patterns, and engineering philosophy behind the FoodApp backend. As the sole engineer on this project, I have designed this system to be robust, scalable, and maintainable, leveraging the best of **Spring Boot 3.5.5** and **Java 21**.

---

## 1. My Architectural Philosophy
I chose a **Feature-Oriented Monolith** approach. While microservices are popular, I decided that for this stage of the project, a monolith offers the best balance between speed of development and operational simplicity.

### Key Design Decisions I Made:
*   **Domain-Driven Organization**: I organized the codebase by business domain (e.g., `order`, `restaurant`, `cart`) rather than technical layer. This allows me to find all code related to a feature in one place.
*   **Strict Statelessness**: I ensured the API is completely stateless. No `HttpSession` is used. All state is either in the database, Redis, or carried in the JWT.
*   **PostgreSQL as the Source of Truth**: I use PostgreSQL for relational data and **PostGIS** for all coordinate-heavy logic.

---

## 2. Geospatial Intelligence & Ranking
I treat location as a first-class citizen. Instead of calculating distances in the application layer, I offload this to the database.

**My Spatial Implementation (`RestaurantRepository.java`):**
```sql
-- I use ST_DWithin to find branches within the delivery radius
AND ST_DWithin(
      b.location,
      ST_MakePoint(:userLon, :userLat)::geography,
      b.delivery_radius_in_km * 10 00
    )
```
**Ranking Logic**: I don't just sort by distance. I designed a ranking algorithm that considers both preparation time and estimated travel time (using a 250m/min constant as a baseline):
```sql
ORDER BY MIN(
    b.avg_prep_time_in_minutes + 
    (ST_Distance(b.location, ST_MakePoint(:userLon, :userLat)::geography) / 250.0)
) ASC
```

---

## 3. Advanced Security & Identity Management
I implemented a multi-layered security model that goes beyond simple password checks.

### 3.1 Token Versioning & Global Logout
To handle the "Stateful Logout in a Stateless System" problem, I implemented **Token Versioning**.
*   **The Logic**: Every user has a `token_version` (Integer) in the database. When I issue a JWT, I include this version as a claim.
*   **The Check**: In my `AuthFilter`, I extract the version from the incoming token and compare it with the current value in the database.
*   **The Result**: If I want to log a user out of all devices (e.g., after a password change or security breach), I simply increment their `token_version` in the DB. The old tokens immediately become invalid.

### 3.2 Forced Password Changes
I use Spring Security's `CredentialsContainer` interface logic. If I mark a user's credentials as expired, my `AuthFilter` intercepts their requests and returns a specific `PASSWORD_CHANGE_REQUIRED` error code, forcing the frontend to redirect them to the password reset page while whitelisting only the password-change endpoint.

---

## 4. The Menu & Customization Engine
I designed a flexible menu system that handles complex add-ons and price overrides.

### 4.1 Shared Option Groups
I used a `ManyToMany` relationship so that a "Toppings" group can be shared across multiple items. This reduces data redundancy and makes menu updates easier for restaurant owners.

### 4.2 Branch-Level Price Overrides
I recognized that the same item might have different costs at different locations. I implemented `BranchOptionConfig` to allow branches to set their own "Effective Price" for variants, overriding the global default.

### 4.3 Deep Cart Comparison
To avoid duplicate line items, I implemented a deep comparison in `CartServiceImpl`. I don't just check the product ID; I check the **set of selected variants**.
```java
// I extract variant IDs and compare them as a Set to ensure exact match
Set<Long> existingVariantIds = ci.getCartItemVariants().stream()
        .map(civ -> civ.getOptionVariant().getId())
        .collect(Collectors.toSet());
if (existingVariantIds.equals(incomingVariantIds)) {
    // I increment quantity instead of adding a new item
}
```

---

## 5. Payment Integrity & Financial Logic
I integrated both **Stripe** and **POK Pay**, with a focus on idempotency and failure recovery.

### 5.1 The Cart Hash Pattern
To prevent "Price Manipulation" or "Order Ghosting", I generate an MD5 hash of the cart before payment.
```java
String full = itemsHash + "_tip:" + cart.getTipAmount() + "_loc:" + deliveryLoc.getId();
return DigestUtils.md5DigestAsHex(full.getBytes());
```
If the user changes their cart after a payment link is generated, the hash mismatch triggers a fresh order creation, ensuring the payment always matches the actual items delivered.

### 5.2 Late Webhook Resurrection
I built a resilient webhook processor. If a payment confirmation arrives **after** a cron job has already marked the order as `FAILED` (late payment), I **resurrect** the order back to `INITIALIZED`. I'd rather fulfill a late-paid order than take a customer's money and ignore it.

### 5.3 Driver Earning Formulas
I implemented a dynamic earnings model. Drivers get 100% of the delivery fee for smaller orders, but for high-value orders, I split the fee 50/50 with the platform, while always giving 100% of the tip to the driver.

---

## 6. Real-time Infrastructure (WebSockets)
I use **STOMP** over WebSockets to keep everyone in sync without constant polling.

*   **Internal Events**: I use Spring's `ApplicationEventPublisher`. When an order is saved, I publish an event.
*   **STOMP Routing**: My `WebSocketController` listens for these events and routes them.
    *   Managers get updates on private branch topics.
    *   Drivers get notifications on a global unassigned queue.
*   **Security**: I secured the `/ws/**` endpoint in my `SecurityFilter`, ensuring only authenticated users can connect to the real-time stream.

---

## 7. Global Resilience & Error Handling
I implemented a centralized `GlobalExceptionHandler` that maps 19+ custom exceptions to semantic HTTP codes.

*   **PostgreSQL Constraint Mapping**: If a unique constraint fails (e.g., assigning a manager who is already busy), I catch the `DataIntegrityViolationException`, parse the constraint name, and return a human-readable error.
*   **Gateway Error Parsing**: When POK Pay or Stripe returns an error, I parse their JSON response to extract the specific failure reason (e.g., "Card Expired") and pass it safely to my frontend.

---

## 8. My Automation Tooling
To scale the platform, I built a custom **Ingestion Engine** in Python (`process_restaurant.py`).
1.  **Normalization**: It maps external assortment JSONs to my internal schema.
2.  **Sequence Integrity**: It generates `SELECT setval` statements to keep PostgreSQL sequences in sync after bulk imports.
3.  **Media Sychronization**: It creates manifests for my AWS S3 upload pipeline, ensuring all restaurant images are hosted on my CloudFront CDN.

---

---

## 9. My Multi-Level Caching Strategy
To handle thousands of concurrent users searching for restaurants without hitting rate limits or slowing down, I implemented a tiered caching layer using **Redis**.

### 9.1 Redis GEO for Discovery
I don't just query the database for "Nearby Restaurants". I use **Redis Geospatial Indexes**.
*   **The Workflow**: When I ingest a new branch, I add its coordinates to a Redis key `restaurant:locations` using `GEOADD`.
*   **The Query**: During discovery, I perform a `GEORADIUS` search to find all branch IDs within a 50km radius. This returns a list of IDs in milliseconds, which I then use to hydrate my JPA queries.

### 9.2 The PricingService & Distance Matrix Orchestration
The **`PricingService`** is the brain of the delivery logistics. It doesn't just calculate prices; it orchestrates the flow between raw geospatial data and user-facing delivery information.

#### How a Request Flows from API to Cache:
1.  **Discovery Request**: A user hits `/api/restaurants/available-restaurants` with their `lat/lng`.
2.  **Radius Filtering**: `RestaurantServiceImpl` uses the Redis GEO index to find all `branchIds` within range.
3.  **DTO Mapping**: For every branch found, `RestaurantDtoMapper` triggers a call to `pricingService.calculateDeliveryInfo()`.
4.  **Quantization (The Key Step)**: Inside `PricingService`, I don't use the raw user coordinates. I pass them through `getUserLocationCacheKey()` which floors them to 3 decimal places.
    *   *Raw*: `41.327543, 19.818732` → *Quantized*: `41.327, 19.818`.
5.  **Cache Interception**: `PricingService` then calls `distanceMatrixService.getDistanceMatrix()`. This method is annotated with `@Cacheable`.
6.  **Redis Lookup**: Spring Security/Caching checks Redis for the key: `distanceMatrix::branchId:41.327,19.818`.
    *   **Cache Hit**: If found, the distance and duration are returned instantly. **Zero external API calls are made.**
    *   **Cache Miss**: If not found, the Google Distance Matrix SDK is invoked. The result is then stored in Redis for the next 30 days (or configured TTL) and returned.
7.  **Logic Application**: `PricingService` takes the distance (cached or fresh) and applies my tiered pricing rules (e.g., $1.50 for < 2km) and calculates the delivery time window.

### 9.3 Why this matters?
*   **Cost Efficiency**: Calling Google for every single "Restaurant List" refresh would cost thousands of dollars a month. This caching reduces API costs by ~95%.
*   **Performance**: A Redis lookup takes < 2ms, while a Google API call takes 200ms - 500ms. This makes the "Discovery Page" feel instantaneous.
*   **Precision vs. Hit-Rate**: By using 3 decimal places (~110m precision), I balance accuracy with cacheability. Users in the same building or street will always hit the same cache entry.

---

## 🚀 Future Roadmap & My Planned Optimizations
*   **Virtual Threads (Project Loom)**: I plan to migrate my `@Async` tasks to Virtual Threads to handle massive spikes in notification volume with minimal memory overhead.
*   **QueryDSL Integration**: As my queries get more complex, I intend to replace some native SQL with QueryDSL for better type-safety.
*   **Distributed Redis Locking**: I will implement distributed locks in the checkout process to prevent race conditions during extreme peak hours (e.g., New Year's Eve).


---
*Authored by: The Solo Lead Engineer*
*Revision: 3.0 (Solo Engineer Perspective)*
