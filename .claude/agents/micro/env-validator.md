---
name: env-validator
description: "Check all required .env variables are set and non-empty. Trigger: Before any deployment or docker compose up."
model: haiku
tools: Bash
---

# Env Validator — Layer 3 Micro-Specialist

**Parent:** Any orchestrator that touches deployment
**Model:** haiku
**Single responsibility:** Check that the project's prod env file has every required variable, and that none are placeholder values.

> **Step 0:** Read the PROJECT PROFILE; take the prod env-file path and the required-variable set from the project (its `.env.example` / compose `${VAR}` references) — never assume FamilyCall's variables.

## Required Variables
Derive the required set from the project: every `${VAR}` referenced in the prod compose, plus whatever the project's `.env.example` documents. Validate each for presence + non-placeholder. Apply type rules where the name implies one (secrets ≥ 32 chars, domains not `localhost`/`example`, IPs match IPv4).

> **Example — FamilyCall (illustrative, not prescriptive):**
> ```
> GOOGLE_CLIENT_ID      — must not be empty
> GOOGLE_CLIENT_SECRET  — must not be empty
> JWT_SECRET            — must be >= 32 chars hex
> DOMAIN                — must not contain "localhost" or "example"
> ORACLE_IP             — must match IPv4 pattern
> TURN_SECRET           — must not be empty
> DB_PASSWORD           — must not be empty
> ```

## Execution
```bash
set -a; source "$ENV_FILE"; set +a   # $ENV_FILE = the project's prod env file

# One check per required var (derived for THIS project). Pattern per type:
[ -z "$<VAR>" ]               && echo "FAIL: <VAR> empty"             # non-empty
[ ${#<SECRET_VAR>} -lt 32 ]   && echo "FAIL: <SECRET_VAR> too short"  # secret length
[[ "$<DOMAIN_VAR>" == *localhost* ]] && echo "FAIL: <DOMAIN_VAR> still localhost"
[[ "$<VAR>" == <placeholder> ]] && echo "FAIL: <VAR> is placeholder"

echo "PASS: all vars present"
```

## Output
```
status: done | failed
data: { missing: string[], placeholder: string[], valid: boolean }
```
