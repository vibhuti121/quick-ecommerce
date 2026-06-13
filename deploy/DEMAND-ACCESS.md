# Reading the demand (waitlist leads & fruit-counts) — self-serve

The quiz writes every signup into Postgres (`notify_signups` in `catalogdb`). One row per chosen
fruit (`topic` = the fruit slug) plus one umbrella `topic='quiz'` row per person. This doc gives you
**three ways** to read that demand. **Method A and B work right now**; Method C is the visual
dashboard and needs a one-time enable step (marked below).

Topics you'll see: `litchi`, `mango`, `honey` (demand-only, not buyable), and the umbrella `quiz`.

The box: `178.105.223.117`  ·  SSH key: `~/.ssh/familycall_deploy`  ·  repo on box: `/root/quick-ecommerce`

---

## Method A — Quick demand pulse (zero setup, from any terminal)

Public, count-only (no personal data). Swap `<slug>` for `litchi` / `mango` / `honey` / `quiz`:

```bash
curl -s "https://mallde.in/api/catalog/notify/count?topic=litchi"
curl -s "https://mallde.in/api/catalog/notify/count?topic=mango"
curl -s "https://mallde.in/api/catalog/notify/count?topic=honey"
curl -s "https://mallde.in/api/catalog/notify/count?topic=quiz"   # ~ total unique people
```

Each returns `{"topic":"litchi","count":N}`. Good for a 5-second "how many want what" check.

---

## Method B — Full leads (names + phone + pincode), on the box

This is the real lead list. SSH in, then run a read-only SQL query (nothing is modified).

```bash
# 1. SSH onto the box
ssh -i ~/.ssh/familycall_deploy root@178.105.223.117
cd /root/quick-ecommerce

# 2a. Demand by fruit (most-wanted first)
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec postgres \
  psql -U postgres -d catalogdb -c \
  "SELECT topic, count(*) AS signups FROM notify_signups GROUP BY topic ORDER BY signups DESC;"

# 2b. The actual leads — name, phone, city/state, when (newest first)
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec postgres \
  psql -U postgres -d catalogdb -c \
  "SELECT created_at, name, phone, email, pincode, city, state, topic
     FROM notify_signups
     WHERE topic <> 'quiz'          -- drop the umbrella rows; keep one row per fruit pick
     ORDER BY created_at DESC
     LIMIT 100;"

# 2c. Demand by geography (where are they?)
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec postgres \
  psql -U postgres -d catalogdb -c \
  "SELECT state, count(DISTINCT phone) AS people FROM notify_signups
     WHERE topic <> 'quiz' GROUP BY state ORDER BY people DESC;"
```

> Tip: to pull the leads into a spreadsheet, add `\copy (…) TO '/tmp/leads.csv' CSV HEADER` inside
> `psql`, then `docker compose … cp postgres:/tmp/leads.csv ./leads.csv` and `scp` it down. Ask me and
> I'll run it for you.

---

## Method C — The visual Demand dashboard (admin-app) — *needs a one-time enable*

The admin-app already has a **Demand page** (per-fruit bars, by-state, 50 most-recent leads), backed
by `GET /api/catalog/admin/notify/demand`. It is **OFF in the pilot** (profile-gated, never exposed to
the internet), so two steps are needed the first time:

```bash
# (i) ON THE BOX — turn the admin-app container on (it binds to loopback only, 127.0.0.1:5174):
ssh -i ~/.ssh/familycall_deploy root@178.105.223.117
cd /root/quick-ecommerce
MALLADE_DOMAIN=mallde.in docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --profile admin up -d admin-app
exit

# (ii) FROM YOUR LAPTOP — open an SSH tunnel so your browser can reach that private port:
ssh -i ~/.ssh/familycall_deploy -L 5174:127.0.0.1:5174 root@178.105.223.117
#     leave this terminal open, then in your browser go to:
#        http://localhost:5174
#     log in with the admin account (admin@mallade.test + the admin password), open "Demand".
```

The dashboard is **never** public — it's reachable only through your SSH tunnel while that terminal is
open. Close the terminal and the door is shut.

> **Status:** Method C is wired in code but not yet exercised on the live box. When you want the visual
> dashboard, ping me — we'll enable it together the first time and confirm the login works. (A future
> upgrade is `admin.mallde.in` behind Cloudflare Access so you can log in from a browser without a
> tunnel — parked for a later round.)

---

### Safety notes
- Methods A & B are **read-only** — they never change or delete data.
- Never run `deploy/03-public-smoke.sh` against `https://mallde.in` to "test" — it **inserts a fake
  signup row** and pollutes the real demand numbers.
- The demand table was cleaned to a true zero before announce; every row you see now is a real visitor.
