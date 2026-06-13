# MaLLADE Phase-0 go-live runbook

Pilot scope: **waitlist + browse, NO money/checkout**. Centerpiece = the "Find your MaLLADE
match" fruit quiz capturing name/phone/email/pincode + chosen fruits into Postgres. 8 core
services on one 4 GB VM behind Cloudflare. Host: **Hetzner CX22** (~₹400/mo, x86, bulletproof —
no idle-reclaim risk) + Cloudflare free. Domain: **mallde.in**.

A green build is NOT "live" — only a **trusted padlock on the real domain + a passing public
smoke** is. The scripts below make the moment-the-box-exists deploy a ~10-minute job.

---

## PART A — Founder-gated actions (I cannot do these; they need your accounts/credentials)

These are the only things blocking go-live. Do them in order:

1. **Create the VM** — **Hetzner CX22** (chosen): 2 vCPU / 4 GB / x86, ~₹400/mo. Pick
   **Ubuntu 22.04/24.04 LTS**. Location: **Germany (Falkenstein/Nuremberg)** — the cheap CX line is
   Germany/Finland only; Cloudflare's India edge fronts the origin so the ~60ms is invisible. Give the
   box a public IPv4.
   - In the Hetzner Cloud console, attach a **Firewall** allowing inbound **22** and **8443**
     (the on-box UFW will tighten these further to your IP / Cloudflare ranges).
   - (x86, so the images build native — no ARM concerns.)

2. **Give me SSH access** to the box (the private key or an authorized_key for a login user).

3. **Point the domain at Cloudflare** (you already own a domain):
   - Add the site to Cloudflare (free plan), switch nameservers at your registrar.
   - I'll hand you the exact A-record + SSL settings; you create the **proxied (orange) A records**
     to the VM IP and set **SSL/TLS = Full**. Full details in `deploy/CLOUDFLARE.md`.
   - Hostname (chosen): **`mallde.in`** apex + `www`.

4. **Sign up for the free off-box backup + uptime accounts** (5 min each):
   - An **rclone-compatible store** for nightly backups: Google Drive, Backblaze B2, or any S3
     (all have free tiers big enough for tiny SQL dumps). You'll run `rclone config` once on the box.
   - **UptimeRobot** free account (or use Cloudflare Health Checks) → monitor `/actuator/health`.

> Everything below PART B I can run for you the moment 1–3 are done.

---

## PART B — Deploy (I run these on the box once you've done PART A)

All scripts live in `deploy/` and are idempotent. Run from the repo root on the VM.

```bash
# 0. Get the repo onto the box (git clone over HTTPS, or rsync from your laptop).

# 1. One-time VM prep: Docker + compose + firewall (SSH from your IP, 8443 from Cloudflare only).
#    Find your laptop's public IP at https://ifconfig.me
sudo bash deploy/01-bootstrap-vm.sh <YOUR_LAPTOP_PUBLIC_IP>

# 2. Generate FRESH prod secrets + bring up the core 8.
#    (gen-secrets.sh writes a fresh random .env on the box — do NOT copy the dev .env over.)
MALLADE_DOMAIN=mallde.in bash deploy/02-deploy.sh
#    -> builds images, starts gateway/frontend/auth/catalog/cart/postgres/redis/minio,
#       waits for the edge to report UP, prints `ps`.

# 3. (You, in Cloudflare) create the proxied A records + SSL=Full per deploy/CLOUDFLARE.md.

# 4. Verify the trusted padlock on the REAL domain (no -k):
curl -sS -o /dev/null -w '%{http_code} verify=%{ssl_verify_result}\n' https://mallde.in/actuator/health
#    expect: 200 verify=0

# 5. Run the trimmed PUBLIC smoke against the live URL:
GW=https://mallde.in bash deploy/03-public-smoke.sh
#    asserts: guest token, browse ?size=200, add-to-cart, quiz->notify 201 + per-fruit count >=1.
#    (If it fails on the FIRST run right after a fresh `up`, re-run WARM before calling it a
#     regression — saga/core cold-start race.)

# 6. Nightly off-box backup of catalogdb (the signups = the only precious data):
rclone config                       # one-time: set up a remote, e.g. named `gdrive`
BACKUP_REMOTE=gdrive:mallade-backups bash deploy/04-backup-catalogdb.sh    # test it once
BACKUP_REMOTE=gdrive:mallade-backups bash deploy/05-install-cron.sh        # 02:30 nightly

# 7. Free uptime monitor: UptimeRobot HTTP monitor on https://mallde.in/actuator/health
#    keyword "UP", or a Cloudflare Health Check. (deploy/CLOUDFLARE.md, step 10.)
```

**Done = trusted padlock + green public smoke + nightly backup cron + uptime monitor.**

---

## Operating notes (the hard-won gotchas — keep these in mind)

- **Frontend changes need a container rebuild.** `compose up` reuses stale images; the deploy
  script always passes `--build`. After any FE change, rebuild AND grep the served bundle.
- **Rotating `DB_PASSWORD` needs `docker compose down -v`** (Postgres auth fails on the stale
  volume password otherwise). But **never `down -v` casually** — postgres holds the admin creds
  AND the precious signups. Back up first (`deploy/04-backup-catalogdb.sh`), then rotate.
- **Flyway runs at service startup, not at build.** A bad migration crash-loops the service →
  gateway 503, invisible to a build gate. Always run the stack + smoke after a migration.
- **Cold-start 503 on the FIRST smoke run** after a fresh `up` is a known readiness race, not a
  regression — re-run warm.
- **Reading demand:** the admin app is OFF in the pilot. Read per-fruit demand via the public
  count endpoint (`GET /api/catalog/notify/count?topic=<slug>`) or, for the full PII list, on-box:
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.prod.yml exec postgres \
    psql -U postgres -d catalogdb -c \
    "SELECT topic, count(*) FROM notify_signups GROUP BY topic ORDER BY 2 DESC;"
  ```
- **Restore drill** (do this once before you trust the backup): on a scratch box, gunzip a dump and
  `psql -U postgres -d catalogdb < dump.sql`, then confirm the row counts match.

## Climbing resource tiers (only when a trigger fires — don't pre-provision)
T1 profiles (now) → T2 heap caps (now) → T3 cgroup `mem_limit` (now) → **T4 K8s HPA** only at
real load. Phase 0 sits at T1–T3 on one 4 GB box. If RAM pressure hits, the first move is NOT a
bigger box — it's confirming the heap caps are honored (`docker stats`) and that no `--profile full`
service crept back up.
