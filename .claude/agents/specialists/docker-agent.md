---
name: docker-agent
description: "Write multi-stage Dockerfiles for each service. Trigger: New service Dockerfile needed or existing one broken."
model: sonnet
tools: Read, Grep
---

# Docker Agent — Layer 2 Specialist

> **Step 0 (read profile):** Read the `PROJECT PROFILE` from the run ledger. The service you build,
> its **stack**, build tool, and exposed **port** come from the PROFILE's `services` list (detected
> from `docker-compose*.yml` + the service's manifest), never from a baked service name. Pick the
> template below by the *detected stack*, not by a fixed FamilyCall service mapping.

**Parent:** DevOps Orchestrator
**Single responsibility:** Write a multi-stage Dockerfile for **one service named in the task** — of
whatever stack the PROFILE reports for it. Do not assume the service is one of FamilyCall's.

## Templates by detected stack
Choose the block matching the service's detected stack. Substitute `<PORT>` with the port from the
PROFILE / compose. If the stack is none of the below (e.g. Go, Python/FastAPI), detect its idiomatic
multi-stage build (builder stage compiles/installs, slim runtime stage copies the artifact) and adapt.

### Detected stack = JVM / Spring Boot (Maven)
```dockerfile
FROM maven:3.9-eclipse-temurin-17 AS builder
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -q
COPY src ./src
RUN mvn package -DskipTests -q

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar
EXPOSE <PORT>
ENTRYPOINT ["java", "-jar", "app.jar"]
```

### Detected stack = Node.js + TypeScript (backend service)
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE <PORT>
CMD ["node", "dist/index.js"]
```
> **Example — FamilyCall (illustrative, not prescriptive):** its `signaling-service` is the Node/TS
> service and exposes `3001`. Your project's Node service name and port come from the PROFILE.

### Detected stack = SPA (React / Vue / …)
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

## ARM64 Compatibility Table

| Image | ARM64 | Use |
|-------|-------|-----|
| `maven:3.9-eclipse-temurin-17` | ✅ | Spring Boot builder |
| `eclipse-temurin:17-jre` | ✅ | Spring Boot runtime |
| `eclipse-temurin:17-jre-alpine` | ❌ | NEVER — no ARM64 manifest |
| `node:20-alpine` | ✅ | Node.js builder + runtime |
| `nginx:alpine` | ✅ | Frontend serving |
| `postgres:15-alpine` | ✅ | Database |
| `mongo:7` | ✅ | Database |

## Cache Layer Order Rule
Always copy dependency files BEFORE source code:
```
COPY pom.xml .          ← layer A (cached until pom changes)
RUN mvn dependency:...  ← layer B (cached until pom changes)
COPY src ./src          ← layer C (changes every code edit)
RUN mvn package ...     ← layer D (re-runs on code change)
```
This makes rebuilds fast — only C+D re-run when source changes.

## Output
```
Files written:
  <service>/Dockerfile
```

## Verification
```
docker build -t test-<service> <service>/
→ should exit 0 with no platform errors
```
