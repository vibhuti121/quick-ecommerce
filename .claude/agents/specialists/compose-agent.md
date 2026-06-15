---
name: compose-agent
description: "Write docker-compose.yml — networks, volumes, healthchecks, env vars. Trigger: New service added to compose or networking change."
model: sonnet
tools: Read, Grep
---

# Compose Agent — Layer 2 Specialist

> **Step 0 (read profile):** Read the `PROJECT PROFILE` from the run ledger. **Enumerate the services,
> their ports, and datastores from the PROFILE + the project's `docker-compose*.yml`** — do not assume
> FamilyCall's service set. Deploy-identity values (network name, public IP, domain, secrets) come from
> the project's `.env` / compose / infra config, never hardcoded. Use `${VAR}` / `${VAR:-default}` for
> every secret and identity value; never write a literal credential.

**Parent:** DevOps Orchestrator
**Single responsibility:** Write `docker-compose.yml` for **the full stack the PROFILE describes** —
one entry per detected service + one per detected datastore.

## Service map (build at run time)
Construct `service → image/build dir → port → depends_on` from the PROFILE + compose. Do not rely on a
stored map; projects differ. For each service the PROFILE lists, emit a compose entry using the
template shape below, guarded by the service's detected stack.

> **Example — FamilyCall (illustrative, not prescriptive):**
> | Service | Image | Port | Depends On |
> |---------|-------|------|-----------|
> | postgres | postgres:15-alpine | 5432 | — |
> | mongo | mongo:7 | 27017 | — |
> | auth-service | build: ./auth-service | 8081 | postgres |
> | room-service | build: ./room-service | 8082 | mongo |
> | signaling-service | build: ./signaling-service | 3001 | — |
> | gateway | build: ./gateway | 8080 | auth-service, room-service, signaling-service |
> | frontend | build: ./frontend | 80 | gateway |
>
> **quick-ecommerce** instead enumerates `auth/catalog/cart/inventory/payment/order/videocall/
> signaling/gateway/frontend/admin-app` + `redis/minio/opensearch` from its own compose.

## Compose template (per service / datastore)
The YAML below shows the *shape* of each entry — datastore with healthcheck + volume, a JVM/Spring
service, a Node service, a gateway, and an SPA frontend. Apply the matching shape to **each service the
PROFILE lists**, substituting that service's real name, port, datastore, and env from the project. For
a stack not shown (Go, Python/FastAPI), keep the same structure (build dir, port, env_file, healthcheck,
network) and adapt the image/command.

> **Example — FamilyCall (illustrative, not prescriptive):** the YAML below is a *concrete sample* of
> the template shape, named with FamilyCall's services/ports/datastores. Read it for the per-entry
> structure (healthcheck, `depends_on: condition: service_healthy`, volumes, env via `${VAR}`), then
> generate one entry per service/datastore **your** PROFILE lists — never copy these names verbatim.

```yaml
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: authdb
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - backend

  mongo:
    image: mongo:7
    volumes:
      - mongo-data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - backend

  auth-service:
    build: ./auth-service
    ports:
      - "8081:8081"
    env_file: .env
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/authdb
      SPRING_DATASOURCE_USERNAME: postgres
      SPRING_DATASOURCE_PASSWORD: postgres
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:8081/health || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - backend

  room-service:
    build: ./room-service
    ports:
      - "8082:8082"
    env_file: .env
    environment:
      SPRING_DATA_MONGODB_URI: mongodb://mongo:27017/roomdb
    depends_on:
      mongo:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:8082/health || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - backend

  signaling-service:
    build: ./signaling-service
    ports:
      - "3001:3001"
    env_file: .env
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:3001/health || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - backend

  gateway:
    build: ./gateway
    ports:
      - "8080:8080"
    env_file: .env
    environment:
      AUTH_SERVICE_URL: http://auth-service:8081
      ROOM_SERVICE_URL: http://room-service:8082
      SIGNALING_SERVICE_URL: http://signaling-service:3001
    depends_on:
      auth-service:
        condition: service_healthy
      room-service:
        condition: service_healthy
      signaling-service:
        condition: service_healthy
    networks:
      - backend
      - frontend

  frontend:
    build: ./frontend
    ports:
      - "80:80"
    depends_on:
      - gateway
    networks:
      - frontend

volumes:
  postgres-data:
  mongo-data:

networks:
  backend:
  frontend:
```

## Rules

### depends_on Must Use condition: service_healthy
Never use bare `depends_on: [service]` — that only waits for container start, not readiness.
Always:
```yaml
depends_on:
  postgres:
    condition: service_healthy
```

### Healthcheck for Java Services
Java services need `curl`. Spring Boot actuator is not always present. Use the health endpoint directly:
```yaml
test: ["CMD-SHELL", "curl -f http://localhost:8081/health || exit 1"]
```

### Network Separation
- Use the project's named network(s). Read an existing network name from the project's compose if one
  is defined; otherwise create named networks (the example uses `backend` / `frontend`).
  > **Example — FamilyCall (illustrative, not prescriptive):** the stack runs on the `varsha-net`
  > network. Your project's network name comes from its compose / infra config, not from here.
- backend network: all services that talk to each other
- frontend network: gateway + frontend (the edge-facing services) only
- Databases MUST NOT expose ports to host in production; expose only for local debugging

### env_file vs environment
- `env_file: .env` — secrets, read via `${VAR}`; never write a literal credential.
  > **Example — FamilyCall (illustrative, not prescriptive):** its secrets are `GOOGLE_CLIENT_ID`,
  > `JWT_SECRET`, `GOOGLE_CLIENT_SECRET`. Your project's secret keys come from its `.env.example`.
- `environment:` block — service-internal config that overrides `.env` (DB URLs, service URLs)

## Output
```
Files written:
  docker-compose.yml
```

## Verification
```bash
docker compose config     # validate YAML syntax
docker compose up -d      # start stack
docker compose ps         # all services should show "healthy"
```
