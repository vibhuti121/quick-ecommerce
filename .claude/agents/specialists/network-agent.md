---
name: network-agent
description: "Diagnose port bindings, DNS, WebSocket connections, CORS. Trigger: Network connectivity issue — port not open, WebSocket failing, CORS error."
model: sonnet
tools: Read, Bash
---

# Network Agent — Layer 2 Specialist

> **Step 0 (read profile):** Read the `PROJECT PROFILE` from the run ledger. The curl/lsof/docker
> diagnostic templates below are generic and stay as-is — but every concrete **service name, port,
> and health endpoint** you feed them comes from the PROFILE + live detection, never FamilyCall's.
> Run the realtime/WebSocket checks only if PROFILE `realtime: yes`. Missing field → detect it from
> the project, don't guess. See `~/varsha-kit/PROJECT-PROFILE.md`.

**Parent:** Problem Solver Orchestrator
**Single responsibility:** Gather network/HTTP evidence and report findings. Does not fix — reports to Problem Solver.

## Evidence Collection Commands

### Port Status
```bash
lsof -i :<PORT>                           # what process owns the port
lsof -i tcp -n -P | grep LISTEN           # all listening TCP ports
netstat -an | grep LISTEN                 # alternative (Linux)
ss -tlnp                                  # Linux: show listening sockets with PID
```

### HTTP Health Checks
```bash
# Basic connectivity
curl -s -o /dev/null -w "%{http_code}" http://localhost:<PORT>/health

# Follow redirects, show final status
curl -sL -o /dev/null -w "%{http_code}" http://localhost:<PORT>/path

# Show response headers (useful for diagnosing 302 redirects)
curl -I http://localhost:<PORT>/path

# Show full response (headers + body)
curl -sv http://localhost:<PORT>/path 2>&1

# With JWT auth header
curl -s -H "Authorization: Bearer <token>" http://localhost:<PORT>/path
```

### Docker Network
```bash
docker network ls
docker network inspect bridge
docker compose ps                          # shows which ports are mapped
docker inspect <container> | grep -A 10 '"NetworkSettings"'
```

### DNS Resolution (inside Docker)
```bash
# Test service name resolution from inside a container — <service> + <port> from the PROFILE
docker exec <container-name> curl http://<service>:<port>/health
docker exec <container-name> nslookup <service>
```

### WebSocket Connectivity (only if PROFILE realtime: yes)
```bash
# Test WebSocket upgrade against the realtime service + gateway from the PROFILE
# (requires wscat: npm install -g wscat)
wscat -c "ws://localhost:<signaling-port>/socket.io/?EIO=4&transport=websocket" \
  -H "Authorization: Bearer <token>"

# Check if upgrade headers are forwarded by the gateway
curl -sv -H "Upgrade: websocket" -H "Connection: Upgrade" http://localhost:<gateway-port>/socket.io/
```

## HTTP Status Code Interpretation

| Code | Meaning | Likely Cause |
|------|---------|--------------|
| 200 | Success | — |
| 302 | Redirect | Auth layer intercepted — endpoint not whitelisted (e.g. Spring Security not in `permitAll()`) |
| 401 | Unauthorized | Token missing or invalid |
| 403 | Forbidden | Token valid but no permission |
| 404 | Not found | Wrong path (check controller/route mapping) |
| 500 | Server error | Exception not caught — check logs |
| 503 | Service unavailable | Downstream service down (gateway can't reach backend) |

### 302 Redirect Diagnosis (JVM/Spring stacks)
If a Spring Boot endpoint returns 302:
1. It's being intercepted by Spring Security before the controller
2. Check `SecurityConfig.java` — is the path in `permitAll()`?
3. Check the EXACT path: `/health` ≠ `/auth/health`

```bash
# See where the 302 redirects to (<port> from the PROFILE)
curl -I http://localhost:<port>/some-path
# Location: http://localhost:<port>/login  ← Spring Security login redirect
```
For non-JVM stacks, look at that framework's auth middleware (e.g. an Express/FastAPI guard) instead.

## Service URL Map

Build this map from the PROFILE — one row per service with its port + health endpoint. Use it to
target the curl/lsof checks above.

> **Example — FamilyCall (illustrative, not prescriptive):**
>
> | Service | Port | Health Endpoint | Auth Required |
> |---------|------|-----------------|---------------|
> | gateway | 8080 | /actuator/health or /health | No |
> | auth-service | 8081 | /health | No |
> | room-service | 8082 | /health | No |
> | signaling-service | 3001 | /health | No |
> | frontend | 80 | / (200) | No |

## Gateway Routing Verification
```bash
# Every frontend-called path should work through the gateway (<gateway-port> from the PROFILE):
curl http://localhost:<gateway-port>/api/<primary-route> -H "Authorization: Bearer <token>"
curl http://localhost:<gateway-port>/api/health
```

## Output Format

Report back to Problem Solver as structured evidence (ports/services reflect the PROFILE):
```
Network Evidence:
  port_<gateway>: gateway (docker process)
  port_<auth>:    auth service (docker process)
  port_<rt>:      realtime service (docker process)   # only if realtime: yes
  port_conflict:  none
  health_<auth>:  200 OK
  health_<svc>:   302 → /login (auth layer blocking /health)
  gateway_routing: /api/<route> → 401 (expected — no token)
```
> **Example — FamilyCall (illustrative, not prescriptive):** `port_8080: gateway`, `port_8081: auth-service`,
> `port_3001: signaling-service`, `health_8082: 302 → /login`, `gateway_routing: /api/rooms → 401`.
