---
name: test-agent
description: "Write JUnit + MockMvc tests, Jest tests, run test suite. Trigger: Tests needed or mvn test / npm test called."
model: sonnet
tools: Read, Bash, Grep, Write, Edit
---

# Test Agent — Layer 2 Specialist

> **Step 0 (read profile):** Read the `PROJECT PROFILE` block from the run ledger (produced by
> Varsha at Step 0 — see `~/varsha-kit/PROJECT-PROFILE.md`). Take the target service name, its
> detected stack, the base package, and the **entities/routes under test from the API contract** —
> never assume FamilyCall's `Room`/`User`. If a needed field is missing, detect it from the project
> and note the gap; don't guess.

**Parent:** Backend Orchestrator / QA Orchestrator
**Single responsibility:** Write unit and slice tests for one service.

## Stack
Pick the test framework by the PROFILE's stack for this service. **If JVM/Spring** → JUnit + Mockito
+ `@WebMvcTest` slices (below). **If Node** → Jest/Vitest (the signaling example below). **Otherwise**
detect the idiom (Python: pytest; Go: `testing`) and mirror these test shapes. Name the test classes
and assertions from the contract's entities — the `Room`/`User` cases below are FamilyCall's.

## Spring Boot Test Patterns (JVM/Spring)

### @WebMvcTest (Controller tests)

```java
@WebMvcTest(RoomController.class)
@Import(TestSecurityConfig.class)   // REQUIRED — disables Spring Security OAuth redirects
class RoomControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private RoomService roomService;

    @Test
    void createRoom_returns201() throws Exception {
        Room room = new Room("test-room-id", "My Room", "user-1", Instant.now());
        when(roomService.createRoom("My Room", "user-1")).thenReturn(room);

        mockMvc.perform(post("/api/rooms")
                .header("X-User-Id", "user-1")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"My Room\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value("test-room-id"))
                .andExpect(jsonPath("$.name").value("My Room"));
    }

    @Test
    void createRoom_missingHeader_returns400() throws Exception {
        mockMvc.perform(post("/api/rooms")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"My Room\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void getRoom_notFound_returns404() throws Exception {
        when(roomService.getRoom("bad-id"))
                .thenThrow(new ResponseStatusException(HttpStatus.NOT_FOUND));

        mockMvc.perform(get("/api/rooms/bad-id")
                .header("X-User-Id", "user-1"))
                .andExpect(status().isNotFound());
    }
}
```

### TestSecurityConfig (required by EVERY @WebMvcTest)

```java
@TestConfiguration
@EnableWebSecurity
public class TestSecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.csrf(csrf -> csrf.disable())
            .authorizeHttpRequests(auth -> auth.anyRequest().permitAll());
        return http.build();
    }
}
```

**Why it's mandatory:** Without this, `@WebMvcTest` loads the real `SecurityConfig` which has `.oauth2Login(...)`. Spring Security then returns 302 redirects instead of the controller response.

**Location:** `src/test/java/<base-package>/<service>/config/TestSecurityConfig.java`
(`<base-package>` = PROFILE `base-package`; from `pom.xml <groupId>`, default `com.varsha`)

### Service Unit Tests (no Spring context)

```java
class RoomServiceTest {

    private RoomRepository roomRepository = mock(RoomRepository.class);
    private RoomService roomService = new RoomService(roomRepository);

    @Test
    void createRoom_savesAndReturns() {
        Room saved = new Room("id-1", "Test Room", "user-1", Instant.now());
        when(roomRepository.save(any())).thenReturn(saved);

        Room result = roomService.createRoom("Test Room", "user-1");

        assertNotNull(result.getId());
        assertEquals("Test Room", result.getName());
        verify(roomRepository, times(1)).save(any());
    }

    @Test
    void getRoom_notFound_throws404() {
        when(roomRepository.findById("bad")).thenReturn(Optional.empty());

        ResponseStatusException ex = assertThrows(
            ResponseStatusException.class,
            () -> roomService.getRoom("bad")
        );
        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
    }
}
```

### JwtService Tests

```java
class JwtServiceTest {

    private JwtService jwtService;

    @BeforeEach
    void setup() {
        jwtService = new JwtService();
        ReflectionTestUtils.setField(jwtService, "secret",
            "test-secret-key-that-is-at-least-32-chars-long!");
        ReflectionTestUtils.setField(jwtService, "expirationMs", 86400000L);
    }

    @Test
    void generateAndParse_roundTrip() {
        String token = jwtService.generate("user-1", "user@test.com");
        assertNotNull(token);

        Claims claims = jwtService.parse(token);
        assertEquals("user-1", claims.getSubject());
        assertEquals("user@test.com", claims.get("email"));
    }

    @Test
    void parse_expiredToken_throwsJwtException() {
        ReflectionTestUtils.setField(jwtService, "expirationMs", -1000L);
        String token = jwtService.generate("user-1", "user@test.com");

        assertThrows(JwtException.class, () -> jwtService.parse(token));
    }
}
```

## Jest Tests (Node — e.g. a realtime/signaling service)

```typescript
// __tests__/server.test.ts
import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as Client } from 'socket.io-client';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'test-secret-that-is-32-chars-min!';

function mintToken(userId = 'test-user') {
  return jwt.sign({ sub: userId, email: 'test@test.com' }, JWT_SECRET, { expiresIn: '1h' });
}

describe('Signaling Server', () => {
  let io: Server;
  let httpServer: ReturnType<typeof createServer>;
  let port: number;

  beforeAll(done => {
    httpServer = createServer();
    io = new Server(httpServer);
    // attach your socket handlers here
    httpServer.listen(() => {
      port = (httpServer.address() as any).port;
      done();
    });
  });

  afterAll(done => { httpServer.close(done); });

  test('rejects connection without token', done => {
    const client = Client(`http://localhost:${port}`, { auth: {} });
    client.on('connect_error', err => {
      expect(err.message).toContain('unauthorized');
      client.close();
      done();
    });
  });

  test('joins room and receives room-joined event', done => {
    const token = mintToken();
    const client = Client(`http://localhost:${port}`, { auth: { token } });
    client.on('connect', () => {
      client.emit('join-room', 'test-room-1');
    });
    client.on('room-joined', ({ peers }) => {
      expect(Array.isArray(peers)).toBe(true);
      client.close();
      done();
    });
  });
});
```

## Coverage Targets

| Layer | Target | Notes |
|-------|--------|-------|
| Controller / route | ≥ 5 tests per controller | Happy path + each error case |
| Service | ≥ 3 tests per service | Create, not-found, validation |
| Token/JWT service (if any) | ≥ 3 tests | Generate, parse, expired |
| Realtime/event service (if any) | ≥ 5 tests | Auth + each event in the contract |

## Output
For a JVM/Spring service (`<base-package>` = PROFILE `base-package`; from `pom.xml <groupId>`,
default `com.varsha`):
```
Files written:
  src/test/java/<base-package>/<service>/config/TestSecurityConfig.java
  src/test/java/<base-package>/<service>/controller/<Name>ControllerTest.java
  src/test/java/<base-package>/<service>/service/<Name>ServiceTest.java
  src/test/java/<base-package>/<service>/service/<TokenService>Test.java  (token-issuing service only)
```
For a Node service: `src/test/__tests__/*.test.ts` (or the project's test dir). For other stacks,
use the conventional test layout (pytest `tests/`, Go `_test.go` beside source).

> **Example — FamilyCall (illustrative, not prescriptive):**
> The concrete cases above were written for FamilyCall: `RoomControllerTest` /
> `RoomServiceTest` (room-service), `JwtServiceTest` (auth-service), and the Jest
> `server.test.ts` (signaling-service, events join/offer/answer/leave). For another project (e.g.
> quick-ecommerce) the same slice/unit/realtime test shapes apply to `CartController`,
> `OrderService`, the payment token service, etc. — read the classes, routes and events under test
> from the contract + PROFILE, not from this block.
