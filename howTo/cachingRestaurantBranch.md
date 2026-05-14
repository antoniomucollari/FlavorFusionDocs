# Restaurant Branch Caching

## 1. Overview

The `GET /api/branches/{id}` endpoint (Restaurant Details) is heavily used by the costumers but also the branch manager, manager. Customers primary use when opening the restaurant venue for menus. To protect the database from read stampedes during peak meal hours, a dedicated caching layer was implemented using Spring Cache and Redis.

Because the `RestaurantBranchDetailsDto` is fully generic and does not contain user-specific data such as distance or favorite status, it is safe to cache and share across all users.

::: info ai summary

## 2. The "Two-Bean" Caching Pattern

To avoid caching dynamic HTTP metadata (such as timestamps or status codes) and to solve Spring's internal AOP proxy bypass limitation, the caching logic is split across two separate services.

### A. Data Layer (`CachedBranchService`)

This service acts as the Redis boundary. Its responsibility is to:

- Check the cache
- Query the database if needed
- Map the entity to the DTO
- Return the raw data

### Cache Configuration

| Property | Value |
|---|---|
| Cache Name | `restaurantDetails` |
| Cache Key | `#branchId` |
| TTL | `10 minutes` |

The 10-minute TTL allows eventual consistency for non-critical updates such as review counts.

```java
@Service
@RequiredArgsConstructor
public class CachedBranchService {

    private final BranchRepository branchRepository;
    private final RestaurantBranchMapper restaurantBranchMapper;

    @Cacheable(value = "restaurantDetails", key = "#branchId")
    public RestaurantBranchDetailsDto getBranchDetails(Long branchId) {
        RestaurantBranch branch = branchRepository.findById(branchId)
                .orElseThrow(() -> new NotFoundException("Branch not found"));

        return restaurantBranchMapper.mapToBranchDetailsDto(branch);
    }

    @CacheEvict(value = "restaurantDetails", key = "#branchId")
    public void clearBranchCache(Long branchId) {
        log.info("Cache forcefully evicted for branch id: {}", branchId);
    }
}
```

---

### B. Orchestration Layer (`BranchService`)

This is the main business service responsible for:

- Handling authentication context
- Wrapping the DTO inside the standard `Response<T>` object
- Returning a fresh HTTP response for every request

The cross-bean call ensures the Spring AOP proxy is triggered correctly, allowing Redis caching to work.

```java
@Service
@RequiredArgsConstructor
public class BranchService implements IBranchService {

    private final CachedBranchService cachedBranchService;

    @Override
    public Response<RestaurantBranchDetailsDto> getById(Long id) {

        // Cross-bean call triggers Spring AOP proxy (Hits Redis)
        RestaurantBranchDetailsDto dto =
                cachedBranchService.getBranchDetails(id);

        return Response.<RestaurantBranchDetailsDto>builder()
                .statusCode(HttpStatus.OK.value())
                .message("Branch details retrieved successfully")
                .data(dto)
                .build();
    }
}
```

---

## 3. Cache Eviction Strategy (Eventual vs Strong Consistency)

Branch updates are categorized into two tiers to balance system performance with user experience.

---

### Tier 1: Passive Expiration (No Immediate Eviction)

The following fields do not require instant cache invalidation:

- `averageRating`
- `reviewCount`
- `avgPrepTimeInMinutes`

### Strategy

Allow the 10-minute TTL to expire naturally.

### Reasoning

Slightly stale data in these fields does not break the checkout flow. Evicting the cache on every review submission would significantly reduce cache hit rates and increase database pressure.

---

### Tier 2: Active Eviction ("Panic Button" Updates)

Critical operational changes require immediate cache invalidation.

### Trigger Events

- `changeOpeningStatus()`
- `editMyBranch()`
    - Delivery radius changes
    - Address updates
    - Phone number updates

### Strategy

Explicitly evict the `restaurantDetails` cache entry for the affected branch.

---

### Implementation: Programmatic Eviction

Because manager update methods derive the branch from the authenticated user rather than receiving a `branchId` directly, programmatic eviction is used through `CacheManager`.

```java
@Override
public Response<Boolean> changeOpeningStatus() {

    RestaurantBranch branch = getBranchFromCurrentUser();

    boolean newStatus = !branch.isClosed();

    branch.setClosed(newStatus);

    branchRepository.save(branch);

    // Forcefully evict cache for this branch
    var cache = cacheManager.getCache("restaurantDetails");

    if (cache != null) {
        cache.evict(branch.getId());
    }

    return Response.<Boolean>builder()
            .statusCode(HttpStatus.OK.value())
            .message("Store status updated")
            .data(newStatus)
            .build();
}
```

Additionally, `editMyBranch()` updates the Redis geospatial index using:

```java
updateRedisGeoIndex(branch)
```

This ensures spatial queries remain accurate after location-related changes.

---

## 4. Known Architectural Trade-offs: The Dashboard Gap

When a manager forcefully closes a branch, the `restaurantDetails` cache is evicted immediately. However, the `dashboardRestaurants` cache is intentionally left untouched.

### UX Impact

A restaurant may temporarily appear as "Open" on the dashboard for up to 5 minutes (dashboard TTL).

If a user clicks the restaurant:

- The details page retrieves fresh data
- The branch correctly appears as "Closed"

---

### Justification

The dashboard cache is grouped by geographical grid.

Evicting a single restaurant from this structure would require:

```java
allEntries = true
```

This would flush the entire dashboard cache and potentially trigger a large database stampede across the city.

The temporary UX inconsistency is considered acceptable compared to the risk of system-wide instability.

Additionally, the `PricingService` recalculates deliverability dynamically during checkout, ensuring invalid orders cannot be placed even if stale dashboard data exists.