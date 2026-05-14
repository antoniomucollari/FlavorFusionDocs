# `SerializablePage<T>`

**Package:** `com.toni.FoodApp.response`

A lightweight serialization wrapper around Spring's `Page<T>` that enables paginated data to be stored and retrieved from Redis.


## Why It Exists

Spring's `PageImpl<T>` cannot be deserialized by Jackson out of the box — it lacks a no-argument constructor and has complex internal state. `SerializablePage<T>` solves this by reducing a page to four plain fields that Redis can safely serialize and deserialize.



## Fields

| Field           | Type      | Description                              |
|-----------------|-----------|------------------------------------------|
| `content`       | `List<T>` | The actual list of items on this page    |
| `pageNumber`    | `int`     | Zero-based page index                    |
| `pageSize`      | `int`     | Number of items per page                 |
| `totalElements` | `long`    | Total number of items across all pages   |



## Constructors & Methods

### `SerializablePage(Page<T> page)`
Converts a Spring `Page<T>` into a serializable form before storing in Redis.

```java
Page<RestaurantSummaryDTO> dtoPage = repository.findAll(pageable);
SerializablePage<RestaurantSummaryDTO> cached = new SerializablePage<>(dtoPage);
```

### `toSpringPage()`
Reconstructs a Spring `Page<T>` after fetching from Redis.

```java
SerializablePage<RestaurantSummaryDTO> cached = // fetched from Redis
Page<RestaurantSummaryDTO> page = cached.toSpringPage();
```



## Round Trip

```
Database
   │
   ▼
PageImpl<T>  ──────────────────────►  SerializablePage<T>  ──►  Redis (JSON)
                new SerializablePage()                               │
                                                                     │
Client  ◄──  PageImpl<T>  ◄──────────────────────────────────────────
                          .toSpringPage()
```


## Usage with `@Cacheable`

```java
@Cacheable(
    value = "dashboardRestaurants",
    key = "#sort + ':' + #pageable.pageNumber + ':' + #roundedLat + ',' + #roundedLng"
)
public SerializablePage<RestaurantSummaryDTO> getCachedDashboardPage(...) {
    Page<RestaurantSummaryDTO> page = repository.findAll(pageable);
    return new SerializablePage<>(page); // wrapped before caching
}
```


## Redis Representation

```json
{
  "@class": "com.toni.FoodApp.response.SerializablePage",
  "content": [ ...list of DTOs... ],
  "pageNumber": 0,
  "pageSize": 10,
  "totalElements": 5
}
```
---

::: info Note
- `T` must itself be serializable by Jackson (no unserializable Spring internals).
- The `@class` field is written by Jackson's polymorphic type handling and is required for correct deserialization — do not remove it from the Redis config.
- This class is **not** a domain object — it is purely a caching utility and should not be exposed directly in API responses.
:::