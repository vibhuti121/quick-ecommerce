# 📜 Loot: Level 0 Cheat Sheet — Reading a System Under Load

## The 3-tier model (say this in any interview)
- **Tier 1 Presentation**: SPAs + the gateway (TLS, auth, rate-limit). One front door.
- **Tier 2 Application**: stateless services — easy to scale BECAUSE stateless.
- **Tier 3 Data**: postgres/redis/object store — hard to scale BECAUSE stateful.
- All of scaling in one sentence: *push state down so the middle can multiply.*

## Percentiles, not averages
- p95 = 95% of requests were faster than this. Averages hide the suffering tail.
- Always report: throughput (req/s) + p95/p99 + error rate. One number alone lies.

## Load-test failure triage (in order)
1. **Is the test lying?** Rotted fixtures, wrong URL, auth, rate-limit on the tester's IP.
   (Our 22% "error rate" was 4 deleted product ids. Fix: data-driven `setup()`.)
2. **Is it cold-start?** Re-run warm. JIT, empty connection pools, cold caches, racing boots.
3. **Is something dead?** `docker ps -a` → exit codes. THEN read logs.
4. Never convict on a grep count — read the actual log lines (our "409"s were UUID fragments).

## Exit codes that matter
- **137** = 128+9 = SIGKILL → almost always a memory kill (OOM). Our payment-service.
- 143 = 128+15 = SIGTERM (graceful stop). 1 = app crashed itself.

## Facts from MY stack (baseline.md has full tables)
- Read path: 193 req/s @ p95 3.4ms, 0% err (Redis read-through cache doing the work).
- Journey: 16.6 req/s warm, p95 97ms, 5.9% checkout failures (CB suspect).
- 7 untuned JVMs idle at ~3.3GiB while postgres sips 90MiB → JVM default ergonomics.
- 202 Accepted ≠ order fulfilled: the saga can still fail asynchronously afterward.

## Commands I now own
```bash
docker stats --no-stream                      # who eats what, right now
docker ps -a --format '{{.Names}} {{.Status}}' # who died, with what exit code
docker logs <c> --since 10m | grep -iE '"level":"(ERROR|WARN)"'
docker run --rm --network quick-ecommerce_default -e BASE_URL=... \
  -v "$PWD/loadtest:/scripts" grafana/k6 run /scripts/browse-lab.js
```
