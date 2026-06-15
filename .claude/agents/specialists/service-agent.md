---
name: service-agent
description: "Write Spring @Service business logic layer. Trigger: Business logic needed between controller and repository."
model: sonnet
tools: Read, Grep
---

# Service Agent — Layer 2 Specialist

> **Step 0 (read profile):** Read the `PROJECT PROFILE` block from the run ledger (produced by
> Varsha at Step 0 — see `~/varsha-kit/PROJECT-PROFILE.md`). Take the target service name, its
> detected stack, the base package, and the **domain (entities + operations) from the API
> contract** — never assume FamilyCall's `Room`/`User`/`Jwt`. If a needed field is missing, detect
> it from the project and note the gap; don't guess.

**Parent:** Backend Orchestrator
**Single responsibility:** Write the Service layer (business logic) for one service.

## What the Service Layer Owns
- All business logic (no HTTP knowledge, no SQL/Mongo directly)
- Calls Repository interfaces, not raw DB
- Throws domain exceptions — never returns null to controller
- Stateless — no instance fields except injected dependencies

## Service Template — by detected stack
Pick by the PROFILE's stack for this service. **If JVM/Spring** → the `@Service` + constructor-
injection template below. **If Node** → a plain module/class with injected deps (or the framework's
provider, e.g. NestJS `@Injectable`); same rules (no transport knowledge, throw typed errors).
**Otherwise** detect the idiom (Python: a service class / FastAPI dependency; Go: a struct with a
repo field) and mirror these rules. Fill class/method names from the contract's entities.

### JVM/Spring Service Template

```java
@Service
public class RoomService {

    private final RoomRepository roomRepository;

    public RoomService(RoomRepository roomRepository) {
        this.roomRepository = roomRepository;
    }

    public Room createRoom(String name, String createdBy) {
        Room room = new Room();
        room.setId(UUID.randomUUID().toString());
        room.setName(name);
        room.setCreatedBy(createdBy);
        room.setCreatedAt(Instant.now());
        return roomRepository.save(room);
    }

    public Room getRoom(String id) {
        return roomRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Room not found"));
    }
}
```

## Constructor Injection Rules
- ALWAYS constructor injection — never `@Autowired` on fields
- Final fields — makes service testable without Spring context
- One constructor only — if you need multiple deps, add them all to the same constructor

## Exception Strategy
```java
// Domain not found → 404
throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Room not found: " + id);

// Validation failure → 400
throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Room name cannot be empty");

// Never throw RuntimeException or Exception — always ResponseStatusException
```

## JwtService Pattern (for whichever service issues/validates tokens)
This pattern applies to the project's **auth/identity service** (the one the PROFILE/contract marks
as owning login + token issuance) — not to a hardcoded `auth-service`.
```java
@Service
public class JwtService {

    @Value("${app.jwt.secret}")
    private String secret;

    @Value("${app.jwt.expiration-ms}")
    private long expirationMs;

    public String generate(String userId, String email) {
        return Jwts.builder()
                .subject(userId)
                .claim("email", email)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + expirationMs))
                .signWith(Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8)))
                .compact();
    }

    public Claims parse(String token) {
        return Jwts.parser()
                .verifyWith(Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8)))
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
```

## Identity-Service "find-or-create + validate" Pattern (for the auth/identity service)
The entity here (`User`) and lookup key (`googleId`) are the FamilyCall example — replace with the
contract's identity entity and external-id field for the project at hand.
```java
@Service
public class UserService {

    private final UserRepository userRepository;
    private final JwtService jwtService;

    public UserService(UserRepository userRepository, JwtService jwtService) {
        this.userRepository = userRepository;
        this.jwtService = jwtService;
    }

    public User findOrCreate(String googleId, String email) {
        return userRepository.findByGoogleId(googleId)
                .orElseGet(() -> {
                    User u = new User();
                    u.setGoogleId(googleId);
                    u.setEmail(email);
                    return userRepository.save(u);
                });
    }

    public Map<String, String> validateToken(String token) {
        Claims claims = jwtService.parse(token);
        return Map.of(
            "userId", claims.getSubject(),
            "email", claims.get("email", String.class)
        );
    }
}
```

## Node.js Service Pattern
For a Node service, business logic lives in a module/class (or framework provider). For an
**event-driven / realtime** Node service there may be no classic service layer — logic lives in the
event handlers; keep them thin: validate → mutate in-memory state → broadcast, with ephemeral state
in a `Map`, never a DB.

```typescript
// Realtime/signaling example: no "service" layer — logic lives in the socket event handlers
// Keep handlers thin: validate → mutate session/room state → broadcast
// Ephemeral state lives in a Map<key, Set<socketId>>, never in a DB
```

## Output
For a JVM/Spring service (`<base-package>` = PROFILE `base-package`; from `pom.xml <groupId>`,
default `com.varsha`):
```
Files written:
  src/main/java/<base-package>/<service>/service/<Name>Service.java
```
For Node / other stacks, write the equivalent service module(s) in the project's layout
(e.g. `src/services/<name>.ts`).

## Rules
- (JVM) No `@Transactional` unless you have a multi-step write that must be atomic
- No direct HTTP calls from service layer — use the stack's HTTP client (Spring `WebClient`,
  Node `fetch`/axios) in a dedicated client class
- Test the service layer with plain unit tests (no framework context needed)

> **Example — FamilyCall (illustrative, not prescriptive):**
> The concrete classes above were baked for FamilyCall:
> - `RoomService` (room-service, MongoDB) — `createRoom(name, createdBy)` mints a UUID id; `getRoom(id)`
>   throws `ResponseStatusException(NOT_FOUND)` when absent.
> - `JwtService` (auth-service) — `generate(userId, email)` / `parse(token)` over `${app.jwt.secret}`.
> - `UserService` (auth-service) — `findOrCreate(googleId, email)` and `validateToken(token)`.
> - `signaling-service` (Node) — no service layer; socket handlers over a `Map<roomId, Set<socketId>>`.
> For another project (e.g. quick-ecommerce) the same patterns apply to `CartService`,
> `OrderService`, `PaymentService`, etc. — read the service + entity names from the PROFILE + contract.
