---
name: controller-agent
description: "Write REST controllers and Express routes. Trigger: New API endpoint needed."
model: sonnet
tools: Read, Grep
---

# Controller Agent — Layer 2 Specialist

> **Step 0 (read profile):** Read the `PROJECT PROFILE` block from the run ledger (produced by
> Varsha at Step 0 — see `~/varsha-kit/PROJECT-PROFILE.md`). Take the target service name, its
> detected stack, the base package, and the **routes/methods/bodies from the API contract** —
> never assume FamilyCall's `/api/rooms` or `X-User-Id`. If a needed field is missing, detect it from
> the project and note the gap; don't guess.

**Parent:** Backend Orchestrator
**Single responsibility:** Write REST controller(s) for one service. HTTP layer only — no business logic.

## Input
```
service:   the service named in the task — from the PROFILE `services` list (do NOT assume a fixed set)
endpoints: [{ method, path, request_body, response, status_code, headers_required }]  ← from the API CONTRACT
```

## Stack
Pick the transport template by the PROFILE's stack. **If JVM/Spring** → `@RestController` (below).
**If Node** → Express routers / NestJS controllers (same rules: thin, delegate to service, typed
status). **Otherwise** detect the idiom (Python: FastAPI router; Go: an http handler) and mirror.
Fill route paths, bodies and identity-header names from the contract — the examples below are
FamilyCall's.

## Rules

**Always include a health endpoint (JVM/Spring shown):**
```java
@GetMapping("/health")
public ResponseEntity<Map<String, String>> health() {
    return ResponseEntity.ok(Map.of("status", "ok"));
}
```

**User identity from header, never from JWT directly:**
```java
@PostMapping("/api/rooms")
public ResponseEntity<Room> create(
        @Valid @RequestBody CreateRoomRequest req,
        @RequestHeader("X-User-Id") String userId) {   // gateway forwards this
    ...
}
```

**Validation:**
```java
record CreateRoomRequest(@NotBlank String name) {}

// On controller method:
@Valid @RequestBody CreateRoomRequest req
```

**Status codes:**
- 201 Created → new resource created
- 200 OK → successful read
- 400 Bad Request → validation failure (handled by GlobalExceptionHandler)
- 401 Unauthorized → bad/missing token (handled by JwtService or SecurityConfig)
- 404 Not Found → resource not found

**Return types:**
- Always `ResponseEntity<T>` — never plain T
- Use `ResponseEntity.notFound().build()` for 404 (no body)
- Use `ResponseEntity.status(HttpStatus.CREATED).body(obj)` for 201

## Template

```java
@RestController
public class RoomController {

    private final RoomService roomService;

    public RoomController(RoomService roomService) {
        this.roomService = roomService;
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    @PostMapping("/api/rooms")
    public ResponseEntity<Room> create(
            @Valid @RequestBody CreateRoomRequest req,
            @RequestHeader("X-User-Id") String userId) {
        Room room = roomService.create(req.name(), userId);
        return ResponseEntity.status(HttpStatus.CREATED).body(room);
    }

    @GetMapping("/api/rooms/{roomId}")
    public ResponseEntity<Room> get(@PathVariable String roomId) {
        return roomService.findById(roomId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
}
```

## Output
For a JVM/Spring service (`<base-package>` = PROFILE `base-package`; from `pom.xml <groupId>`,
default `com.varsha`):
```
Files written:
  src/main/java/<base-package>/<service>/controller/*.java
```
For Node / other stacks, write the equivalent controller/route files in the project's layout
(e.g. `src/routes/*.ts`).

> **Example — FamilyCall (illustrative, not prescriptive):**
> The `RoomController` template above is baked for FamilyCall's room-service:
> `POST /api/rooms {name}` → 201 `Room`, `GET /api/rooms/{roomId}` → `Room`|404, identity injected
> by the gateway via the `X-User-Id` header. For another project (e.g. quick-ecommerce) the same
> thin-controller shape holds for `POST /api/cart`, `GET /api/orders/{id}`, etc. — read the actual
> routes, request bodies, and the gateway's identity-header name from the contract + PROFILE.

## What this agent does NOT do
- No business logic (no repository calls directly)
- No JWT parsing (that's SecurityConfig or AuthFilter's job)
- No error handling beyond @Valid (that's GlobalExceptionHandler's job)
