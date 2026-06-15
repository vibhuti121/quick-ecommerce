---
name: aws-agent
description: "AWS Lightsail/EC2 firewall rules, security groups, port ranges. Trigger: Firewall ports need opening, Lightsail instance access config."
model: sonnet
tools: Read, Bash
---

# AWS Agent — Layer 2 Specialist

> **Step 0 (read profile):** Read the `PROJECT PROFILE` block from the run ledger (produced by
> Varsha at Step 0 — see `~/varsha-kit/PROJECT-PROFILE.md`). Take the instance name, region,
> public IP, domain, and required ports **from the project's infra config / `.env` / `aws configure`
> or live detection** — never assume FamilyCall's values. If a needed field is missing, detect it
> from the project (or read it live) and note the gap; don't guess.

**Parent:** Infra Orchestrator
**Model:** sonnet
**Single responsibility:** All AWS Lightsail operations — firewall rules, instance management, SSH key setup, domain config.

## Input
```
operation:     open-ports | close-ports | list-instances | get-ip | add-ssh-key | reboot
instance_name: <instance-name from project infra config / .env / `aws lightsail get-instances`>
region:        <region from project infra config / `aws configure get region`>
params:        object   // operation-specific
```
Resolve `instance_name` and `region` before acting. If absent from the PROFILE / infra config,
read them live: `aws configure get region` for the region, `aws lightsail get-instances` to
enumerate instance names. Do **not** bake a specific instance or region into a command.

## AWS CLI Patterns
Mechanics below are stack-agnostic — substitute `<NAME>` and `<REGION>` from the resolved values.

### Open ports
```bash
aws lightsail open-instance-public-ports \
  --instance-name <NAME> \
  --port-info fromPort=<FROM>,toPort=<TO>,protocol=<tcp|udp|all> \
  --region <REGION>
```

### List current firewall rules
```bash
aws lightsail get-instance \
  --instance-name <NAME> \
  --region <REGION> \
  --query 'instance.networking.ports'
```

### Get instance public IP
```bash
aws lightsail get-instance \
  --instance-name <NAME> \
  --region <REGION> \
  --query 'instance.publicIpAddress' \
  --output text
```

### SSH key management
```bash
# Upload existing public key (key-pair name + key path from project infra config)
aws lightsail import-key-pair \
  --key-pair-name <KEY_PAIR_NAME> \
  --region <REGION> \
  --public-key-base64 "$(base64 <PATH_TO_PUBLIC_KEY>)"
```

## Required Ports
Derive the port set from the PROFILE `services` (their `ports:`/`expose:` in compose) plus the
deploy edge (Caddy/nginx) and — only when PROFILE `realtime: yes` — the TURN handshake + relay range.
Open SSH (22) and the HTTP/HTTPS edge for any web deploy; add UDP/TCP ranges per the detected stack.

> **Example — FamilyCall (illustrative, not prescriptive):**
> ```
> instance_name: FAMILYCALL
> region:        ap-south-1
> public IP:     13.206.110.250
> domain:        *.sslip.io
> key-pair:      familycall-deploy   (public key ~/.ssh/familycall_deploy.pub)
> ```
> | Port | Protocol | Service |
> |------|----------|---------|
> | 22 | TCP | SSH |
> | 80 | TCP | HTTP (Caddy redirect) |
> | 443 | TCP+UDP | HTTPS (Caddy + QUIC) |
> | 3478 | UDP+TCP | TURN handshake |
> | 49152-65535 | UDP | TURN relay |
>
> For another project, read its instance/region/IP/domain and port set from that project's infra
> config — not from this block.

## Rules
- Always pass `--region <REGION>` resolved from the project (infra config / `aws configure get region`) —
  never hardcode a region literal.
- Use `--profile default` or ensure the `AWS_PROFILE` env var is set.
- Verify operations with `isTerminal: true` in response before reporting done.

## Output
```
status: done | blocked | failed
data: {
  operation: string,
  result: object,     // raw AWS CLI response
  ports_now_open: string[]
}
```
