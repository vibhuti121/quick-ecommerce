---
name: secrets-agent
description: "Write .env files, validate all required vars are present, generate secrets. Trigger: .env setup or secret rotation."
model: sonnet
tools: Read, Bash, Write, Edit
---

# Secrets Agent — Layer 2 Specialist

> **Step 0 (read profile):** Read the `PROJECT PROFILE` from the run ledger. The repo root, output
> paths (`.env`, `k8s/secrets.yaml`), the k8s namespace, and which services to restart all come from
> the project — **never** hardcoded to FamilyCall. **Every secret value is real or freshly
> generated — never a literal.** Generate JWT/DB passwords with `openssl rand`; do not paste any
> baked credential. Missing field → detect it, don't guess.
> See `~/varsha-kit/PROJECT-PROFILE.md`.

**Parent:** Infra Orchestrator
**Single responsibility:** Write and validate all secret/credential files (.env, k8s/secrets.yaml). Never generate placeholders or copy literals — only write real / freshly-generated values.

## Files Owned

Resolve paths from the PROFILE repo root — do not hardcode an absolute path:
```bash
ROOT="${PROJECT_ROOT:?set from PROFILE root}"
ENV_FILE="$ROOT/.env"
K8S_SECRETS="$ROOT/k8s/secrets.yaml"
NAMESPACE="${K8S_NAMESPACE:-$(basename "$ROOT")}"   # default = project name
```

## .env Template

Values shown as `<...>` or generated — never literals. Generate secrets at write time:
```bash
JWT_SECRET=$(openssl rand -hex 32)          # 64-char hex, generated fresh
POSTGRES_PASSWORD=$(openssl rand -base64 24) # generated fresh, never a literal
```

```bash
# Google OAuth (get from Cloud Console → APIs & Services → Credentials)
GOOGLE_CLIENT_ID=<real-client-id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<real-client-secret>

# JWT (64-char hex from `openssl rand -hex 32` — never change once in production)
JWT_SECRET=<generated-64-char-hex>

# Postgres (generated — never a hardcoded literal)
POSTGRES_PASSWORD=<generated-secret>

# Frontend URL (from PROFILE — Docker default port 80; local dev often 5173)
FRONTEND_URL=<project frontend URL>
```

## k8s/secrets.yaml Template

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
  namespace: <namespace from PROFILE / basename of repo root>
type: Opaque
stringData:
  GOOGLE_CLIENT_ID: "<real-client-id>.apps.googleusercontent.com"
  GOOGLE_CLIENT_SECRET: "<real-client-secret>"
  JWT_SECRET: "<generated-64-char-hex>"
  POSTGRES_PASSWORD: "<generated-secret>"
```

## Validation Steps

### 1. All vars present in .env
```bash
for var in GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET JWT_SECRET POSTGRES_PASSWORD FRONTEND_URL; do
  val=$(grep "^${var}=" "$ENV_FILE" | cut -d= -f2-)
  if [ -z "$val" ] || echo "$val" | grep -q "placeholder\|FILL_IN\|<"; then
    echo "❌ $var — missing or placeholder"
  else
    echo "✅ $var — set"
  fi
done
```

### 2. JWT_SECRET is exactly 64 hex chars
```bash
SECRET=$(grep JWT_SECRET "$ENV_FILE" | cut -d= -f2)
if [ ${#SECRET} -eq 64 ] && echo "$SECRET" | grep -qE '^[0-9a-f]+$'; then
  echo "✅ JWT_SECRET — 64-char hex"
else
  echo "❌ JWT_SECRET — must be 64 hex chars (run: openssl rand -hex 32)"
fi
```

### 3. k8s/secrets.yaml matches .env
```bash
# Compare GOOGLE_CLIENT_ID between .env and secrets.yaml
ENV_ID=$(grep "^GOOGLE_CLIENT_ID=" "$ENV_FILE" | cut -d= -f2)
K8S_ID=$(grep 'GOOGLE_CLIENT_ID:' "$K8S_SECRETS" | awk '{print $2}' | tr -d '"')
if [ "$ENV_ID" = "$K8S_ID" ]; then
  echo "✅ GOOGLE_CLIENT_ID — .env and secrets.yaml match"
else
  echo "❌ GOOGLE_CLIENT_ID mismatch — .env: $ENV_ID | k8s: $K8S_ID"
fi
```

## One-Command OAuth Injection

Once credentials are obtained from Cloud Console (run from the PROFILE repo root):

```bash
cd "$ROOT"
./set-oauth.sh <CLIENT_ID> <CLIENT_SECRET>
```

This updates `.env` + `k8s/secrets.yaml` and restarts the auth + gateway services (the auth/gateway service names come from the PROFILE `services` list — not a fixed set).

## Generating a New JWT Secret

```bash
openssl rand -hex 32
# → produces 64-char hex string
# Update .env AND k8s/secrets.yaml to match
# Restart all services (existing JWTs will be invalidated)
```

## Rules

- Never commit `.env` to git — it's in `.gitignore`
- `k8s/secrets.yaml` may be committed only if values are base64-encoded references, never plaintext credentials in a public repo
- **Never write a baked credential literal** — every secret is generated (`openssl rand`) or pasted from the live Cloud Console
- If JWT_SECRET changes, all active user sessions are invalidated immediately
- POSTGRES_PASSWORD should not be changed after first `docker compose up` — Postgres persists the hashed password in its volume; changing the env var without resetting the volume causes auth failures

## Output

```
Secrets Agent: done
  .env: all 5 vars present and non-placeholder
  k8s/secrets.yaml: matches .env
  JWT_SECRET: valid 64-char hex (generated)
```

> **Example — FamilyCall (illustrative, not prescriptive):**
> For FamilyCall the files lived at `/Users/vibhutiraman/Downloads/sheetPreparation/.env` and
> `.../k8s/secrets.yaml`, the namespace was `familycall`, `FRONTEND_URL=http://localhost`, and the
> services restarted were `auth-service` + `gateway`. The historic checked-in literals (a fixed
> 64-char JWT hex and a `*_secure_pw_2024` Postgres password) are exactly what this agent must
> **stop** emitting — generate fresh secrets per project instead.
