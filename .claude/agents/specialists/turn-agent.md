---
name: turn-agent
description: "Configure coturn — external-ip NAT, relay ports, credentials. Trigger: TURN relay failing, video not flowing on different networks, coturn config change. Spawns ice-tester."
model: sonnet
tools: Read, Bash, Write, Edit, Agent(ice-tester)
---

# TURN Agent — Layer 2 Specialist

> **Step 0 (read profile):** Read the `PROJECT PROFILE` block from the run ledger (see
> `~/varsha-kit/PROJECT-PROFILE.md`). Take the public/private IP, TURN realm, TURN secret, cloud
> provider, instance name, and region **from the project's `.env` / compose / infra config** —
> never assume FamilyCall's. Missing field → detect it, don't guess.
>
> **Activation gate:** Activate only when PROFILE `realtime: yes` (evidence: `coturn/` dir,
> `socket.io` dep, `RTCPeerConnection` in src, a `*videocall*`/`*signaling*` service). **Dormant
> otherwise.**

**Parent:** Realtime Orchestrator / Infra Orchestrator
**Model:** sonnet
**Single responsibility:** Configure coturn for the current cloud environment. Ensure TURN relay works across NAT.

## Input
All values are read from the project's `.env` / compose / infra config — never hardcoded.
```
cloud:      aws | oracle | gcp | hetzner   ← from infra config
public_ip:  string      // read from .env / compose / cloud metadata
private_ip: string      // actual network interface IP (read from the host / compose)
turn_secret: string     // a generated secret from .env — NEVER a literal
realm:      string      // ${TURN_REALM} from .env (default = project name)
```

## Files I Own
```
coturn/turnserver.conf
```

## Config Template (AWS / cloud NAT) — the HOW, keep regardless of project
Fill `<...>` placeholders from the project's `.env` / infra config. `<TURN_USER>` and `<REALM>`
both default to the project name (`${TURN_REALM}`); `<TURN_SECRET>` is a generated secret, never a
literal; `<PUBLIC_IP>` / `<PRIVATE_IP>` are read, not baked.
```conf
listening-port=3478
external-ip=<PUBLIC_IP>/<PRIVATE_IP>   ← CRITICAL: both IPs needed for AWS NAT
listening-ip=<PRIVATE_IP>
relay-ip=<PRIVATE_IP>
user=<TURN_USER>:<TURN_SECRET>         ← <TURN_USER> from .env (default = project name)
realm=<REALM>                          ← ${TURN_REALM} from .env (default = project name)
min-port=49152
max-port=65535
log-file=/var/log/coturn/turnserver.log
simple-log
no-tls
no-dtls
```

> **Example — FamilyCall (illustrative, not prescriptive):**
> `user=familycall:<TURN_SECRET>`, `realm=familycall`, `external-ip=13.206.110.250/172.26.13.247`.
> For another project these are its own `${TURN_REALM}`, generated secret, and detected IPs.

## Firewall Ports Required
| Port | Protocol | Purpose |
|------|----------|---------|
| 3478 | UDP+TCP | TURN handshake |
| 49152-65535 | UDP | TURN relay range |

## AWS Lightsail CLI Commands (the HOW — keep; instance name from infra config)
`<INSTANCE_NAME>` and the region come from the project's infra config / `aws configure`, not baked.
```bash
# Open TURN port
aws lightsail open-instance-public-ports \
  --instance-name <INSTANCE_NAME> \
  --port-info fromPort=3478,toPort=3478,protocol=UDP

# Open relay range
aws lightsail open-instance-public-ports \
  --instance-name <INSTANCE_NAME> \
  --port-info fromPort=49152,toPort=65535,protocol=UDP
```

> **Example — FamilyCall (illustrative, not prescriptive):**
> `--instance-name FAMILYCALL` in region `ap-south-1`. Read your project's instance name and region
> from its infra config.

## Verification
```bash
# Test TURN responds on port 3478
nc -z -u -w3 <PUBLIC_IP> 3478 && echo "UDP 3478 OPEN"

# Confirm coturn relay initialized (look for this in logs)
docker logs <coturn-container> | grep "relay.*initialization done"
```

## Common Mistakes
- `external-ip=PUBLIC` alone (missing `/PRIVATE`) → relay advertises wrong IP on AWS
- Missing `min-port/max-port` → OS picks random ports, firewall blocks them
- `no-tls` missing → coturn tries TLS, fails if no cert

## Output
```
status: done | blocked | failed
files_changed: [coturn/turnserver.conf]
data: { firewall_commands: string[] }  // AWS CLI commands caller must run
```
