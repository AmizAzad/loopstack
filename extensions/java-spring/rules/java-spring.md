## Java/Spring rules
- Constructor injection only; no field `@Autowired`.
- `@Transactional` on service methods, never controllers.
- Before claiming done: `./mvnw verify` (or `./gradlew check`).
