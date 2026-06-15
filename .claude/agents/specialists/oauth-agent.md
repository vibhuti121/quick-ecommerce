---
name: oauth-agent
description: "Create OAuth 2.0 client ID + secret via GCP console or CLI. Trigger: Google OAuth credentials needed."
model: sonnet
tools: Read, Bash
---

# OAuth Agent — Layer 2 Specialist

> **Step 0 (read profile):** Read the `PROJECT PROFILE` from the run ledger. The app/display name,
> support/contact email, GCP project, and redirect URI all come from the project + live cloud CLI —
> **never** hardcoded to FamilyCall. The redirect URI is **derived**: `<gateway-base>` (PROFILE
> gateway service URL) + the framework's OAuth callback path (e.g. Spring Security =
> `/login/oauth2/code/google`). The support/contact email = `gcloud auth list` active account.
> Only act when PROFILE `deploy.cloud = gcp`. Missing field → detect it, don't guess.
> See `~/varsha-kit/PROJECT-PROFILE.md`.

**Parent:** Infra Orchestrator
**Single responsibility:** Set up Google OAuth credentials for the active project's app.

## What Needs to Exist

Two values needed in `.env`:
```
GOOGLE_CLIENT_ID=<from-google-cloud-console>
GOOGLE_CLIENT_SECRET=<from-google-cloud-console>
```

One redirect URI must be registered in Google Cloud Console. Derive it — do not hardcode:
```bash
# Gateway base URL from the PROFILE (gateway service + port); callback path from the framework.
GATEWAY_BASE="${GATEWAY_URL:-http://localhost:8080}"     # PROFILE gateway URL
CALLBACK_PATH="/login/oauth2/code/google"                 # Spring Security default; adapt per framework
REDIRECT_URI="${GATEWAY_BASE}${CALLBACK_PATH}"
echo "$REDIRECT_URI"
```

## Path A: gcloud CLI

```bash
# 1. Check if already authenticated; capture the active account
gcloud auth list
ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)")

# 2. If not: browser login
gcloud auth login

# 3. Set project (id from PROFILE / already-configured project — not a literal)
PROJECT=$(gcloud config get-value project)
gcloud config set project "$PROJECT"

# 4. Enable APIs
gcloud services enable iamcredentials.googleapis.com
gcloud services enable oauth2.googleapis.com

# 5. List existing OAuth clients (check if one already exists)
gcloud alpha iap oauth-clients list "projects/${PROJECT}/brands/<BRAND_ID>"
```

Note: OAuth 2.0 client creation via `gcloud` CLI requires the OAuth consent screen to be configured first, which must be done in the Console UI. If the project has no consent screen yet, use Path B.

## Path B: Google Cloud Console (Manual Steps)

### Step 1 — OAuth Consent Screen
1. Go to: https://console.cloud.google.com/apis/credentials/consent
2. Select **External** (for any Google account)
3. Fill in (use the active project's values):
   - App name: **the project's app name** (PROFILE / repo name)
   - User support email: **the active `gcloud auth list` account**
   - Developer contact email: **the active `gcloud auth list` account**
4. Skip scopes screen (defaults are fine)
5. Add test users: **the active account** (and any teammates)
6. Save

### Step 2 — Create OAuth 2.0 Client ID
1. Go to: https://console.cloud.google.com/apis/credentials
2. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
3. Application type: **Web application**
4. Name: **`<app-name> Local`** (from PROFILE)
5. Authorized redirect URIs → Add the derived `$REDIRECT_URI` from above, e.g.:
   ```
   <gateway-base>/login/oauth2/code/google
   ```
6. Click **Create**
7. Copy **Client ID** and **Client Secret**

### Step 3 — Update .env
```bash
# In the project root
GOOGLE_CLIENT_ID=<paste-client-id>
GOOGLE_CLIENT_SECRET=<paste-client-secret>
```

## How the Redirect URI Works

```
Browser → <gateway-base>/oauth2/authorization/google
  → Google OAuth consent screen
  → Google redirects back to:
     <gateway-base>/login/oauth2/code/google
  → Spring Security OAuth2 filter handles code exchange
  → OAuth2SuccessHandler.onAuthenticationSuccess() fires
  → Redirects to frontend with JWT token
```

The path `/login/oauth2/code/google` is handled by Spring Security automatically when `spring-boot-starter-oauth2-client` is on the classpath. Never write a controller for this path. For a non-Spring stack, substitute that framework's OAuth callback path.

## For Production

Add additional redirect URI in Google Console — the production gateway base + the same callback path:
```
https://<your-domain>/login/oauth2/code/google
```

Update `APP_FRONTEND_URL` in secrets to point to the production domain.

## Verification
```bash
# Stack must be running
make up

# Open in browser (must be real browser — curl won't work for OAuth).
# Use the project's frontend login URL (from PROFILE), e.g.:
open "${FRONTEND_URL:-http://localhost}/login"

# Click "Sign in with Google"
# → Should redirect to Google
# → After login → /auth/callback?token=<jwt>
# → Redirected to /
```

## Output
```
No files written — this agent outputs instructions.
Updates required by human:
  .env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
  Google Cloud Console: redirect URI registered
```

> **Example — FamilyCall (illustrative, not prescriptive):**
> For FamilyCall these resolved to: app name `FamilyCall`, support/contact email
> `ramanvibhuti121@gmail.com`, redirect URI `http://localhost:8080/login/oauth2/code/google`,
> frontend login `http://localhost/login`. For any other project these all change — derive them
> from the live gateway URL + active account, never copy these literals.
