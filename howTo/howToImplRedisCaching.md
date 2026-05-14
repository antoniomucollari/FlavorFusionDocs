# How to implement Redis caching and one example
Here I will explain with code how you (and I in future) can implement ***redis caching*** in your app with the available restaurant example.
[Cache hit example](distanceMatrixCacheExample.png)
## Add dependency in pom.xml file
```xml
		<dependency>
			<groupId>org.springframework.boot</groupId>
			<artifactId>spring-boot-starter-data-redis</artifactId>
		</dependency>
```

## Add annotation to the Main method
```java{3}
@SpringBootApplication
@EnableAsync
@EnableCaching // [!code focus]
@EnableScheduling
@RequiredArgsConstructor
public class FoodAppApplication {
	public static void main(String[] args) {
		SpringApplication.run(FoodAppApplication.class, args);
	}
}
```

## Configure Redis in `application.properties`

```properties
spring.data.redis.host=localhost
spring.data.redis.port=6379
```
## Create Redis Configuration

```java
@Configuration
@EnableCaching
public class RedisConfig {

    @Bean
    @Primary
    public RedisTemplate<String, String> redisTemplate(RedisConnectionFactory connectionFactory) {
        RedisTemplate<String, String> template = new RedisTemplate<>();
        template.setConnectionFactory(connectionFactory);
        template.setKeySerializer(new StringRedisSerializer());
        template.setValueSerializer(new StringRedisSerializer());
        template.setHashKeySerializer(new StringRedisSerializer());
        template.setHashValueSerializer(new StringRedisSerializer());
        return template;
    }
    @Bean
    public RedisCacheManager cacheManager(RedisConnectionFactory connectionFactory) {

        // JSON Serializer
        GenericJackson2JsonRedisSerializer jsonSerializer = new GenericJackson2JsonRedisSerializer();

        // Default config
        RedisCacheConfiguration defaultConfig = RedisCacheConfiguration.defaultCacheConfig()
                .serializeValuesWith(RedisSerializationContext.SerializationPair.fromSerializer(jsonSerializer))
                .entryTtl(Duration.ofMinutes(60));

        // Add the JSON serializer to specific config for example with different ttl
        RedisCacheConfiguration microCacheConfig = RedisCacheConfiguration.defaultCacheConfig()
                .serializeValuesWith(RedisSerializationContext.SerializationPair.fromSerializer(jsonSerializer))
                .entryTtl(Duration.ofSeconds(5));

        return RedisCacheManager.builder(connectionFactory)
                .cacheDefaults(defaultConfig)
                .withCacheConfiguration("userProfileCache", microCacheConfig)
                .build();
    }
}
```

## 5. Add `@Cacheable` to a method
```java
    @Cacheable(value = "distanceMatrix", key = "#restaurantBranchId + ':' + #userLocationKey", sync = true)//[!code --]
    @Cacheable(value = "distanceMatrix", key = "#restaurantBranchId + ':' + #userLocationKey") //[!code ++]
    public DistanceMatrixInfo getDistanceMatrix(Long restaurantBranchId, String userLocationKey, LatLng origin, LatLng destination) {...}
```
That's it. Now whenever a request with `branchId` + `userLocationKey` (which is formated from the helper `getUserLocationCacheKey`) is present in the cache will trigger a cache hit. Else a cache miss and the cache will get added the new result which is returned from this method.
### What is `value = "distanceMatrix"`?


The `value` represents the **cache name**.


### What does `sync = true` do?
> [!WARNING]
> It did not fix the [multiple api call for the api distance matrix](/singularIssues/issueWithMultipleApiCalls.md). therefore I removed it.


***What it should do:*** prevents multiple threads from calculating the same cache value at the same time.
Flow:

```text
First request:
    computes value

Other requests:
    wait for first request

Then:
    all use the cached result
```
### [why it did not work with sync = true](/singularIssues/issueWithMultipleApiCalls.md#why-it-did-not-work-for-me)