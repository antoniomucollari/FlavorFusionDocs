# Architecture Decision Record: Restaurant Menu Caching

## 1. Overview

To optimize menu retrieval and handle search queries without causing Redis memory fragmentation, menu caching uses a Two-Bean architecture. The full menu is cached at the branch level, while search filtering is executed in-memory.



## 2. Caching Architecture

### A. Data Layer (`CachedMenuService`)

This service interacts with the database and acts as the Redis boundary. Its responsibility is to fetch the complete, unfiltered menu for a given branch.

### Cache Configuration

| Property | Value |
|---|---|
| Cache Name | `branchMenus` |
| Cache Key | `#branchId` |
| TTL Configuration | `2 Hours` |

---

### B. Orchestration Layer (`MenuService`)

This service handles business logic, applies search filtering, and constructs the HTTP response.

The workflow is:

1. Retrieve the full menu from `CachedMenuService`
2. Apply Java Stream filtering if `searchString` exists
3. Return only the matching categories and menu items



## 3. Search String Handling Strategy

The `searchString` parameter is intentionally excluded from the Redis cache key.

### The Problem

Including user input inside cache keys would create separate Redis entries for every partial keystroke.

Examples:

```text
"b"
"bu"
"bur"
"burger"
```

This would lead to:

- Duplicate cached payloads
- Severe Redis memory waste
- Poor cache efficiency

---

### The Solution ("Cache All, Filter Local")

The complete menu payload is retrieved from Redis.

Jackson then deserializes the cached payload into fresh Java objects, after which filtering is applied in-memory before returning the response to the client.

This strategy:

- Protects the database from repeated reads
- Keeps Redis memory usage minimal
- Avoids cache fragmentation caused by search queries


## 4. Cache Eviction

Menu data requires strong consistency when modified by a branch manager. Because of this, the cache is actively evicted whenever changes occur.

### Eviction Trigger

```java
@CacheEvict(value = "branchMenus", key = "#branchId")
```

Located in:

```java
CachedMenuService.clearMenuCache(Long branchId)
```

---

### Implementation

`BranchManagerMenuService` executes the eviction method after saving database modifications.

---

### Events Requiring Eviction

- Creating a new menu item (`createMenu`)
- Updating:
    - Price
    - Availability
    - Highlighted status (`updateMenu`)

---
### Branch ID Resolution

Because HTTP request methods (`PUT`, `POST`) do not always receive `branchId` directly as a parameter, the service extracts the ID from either:

- The saved `BranchMenuItem` entity
- The authenticated user context

The cache eviction is then triggered using the resolved branch ID.