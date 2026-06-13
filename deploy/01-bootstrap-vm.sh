#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# 01-bootstrap-vm.sh — one-time VM prep for the MaLLADE Phase-0 pilot box.
# Run ONCE on a fresh Ubuntu LTS VM (Oracle Cloud Always-Free ARM, or Hetzner CX22).
# Idempotent: safe to re-run. Installs Docker + compose plugin, sets up the firewall.
#
#   sudo bash deploy/01-bootstrap-vm.sh <FOUNDER_SSH_IP>
#
# <FOUNDER_SSH_IP> = the public IP you SSH in from (https://ifconfig.me on your laptop).
# Pass "any" to leave SSH open to the world (NOT recommended — lock it down).
# ---------------------------------------------------------------------------
set -euo pipefail

FOUNDER_IP="${1:?usage: sudo bash 01-bootstrap-vm.sh <FOUNDER_SSH_IP|any>}"

if [[ $EUID -ne 0 ]]; then echo "run as root (sudo)"; exit 1; fi

echo "== apt update + base packages =="
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg ufw rclone

# ---- Docker Engine + compose plugin (official repo, multi-arch) -----------
if ! command -v docker >/dev/null 2>&1; then
  echo "== installing Docker Engine =="
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  ARCH="$(dpkg --print-architecture)"   # arm64 on Oracle ARM, amd64 on Hetzner
  CODENAME="$(. /etc/os-release && echo "$VERSION_CODENAME")"
  echo "deb [arch=$ARCH signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $CODENAME stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
  echo "Docker already installed: $(docker --version)"
fi
systemctl enable --now docker

# Let the non-root login user run docker without sudo (re-login to take effect).
TARGET_USER="${SUDO_USER:-ubuntu}"
if id "$TARGET_USER" >/dev/null 2>&1; then
  usermod -aG docker "$TARGET_USER" || true
  echo "Added $TARGET_USER to the docker group (log out/in to use docker without sudo)."
fi

# ---- Firewall (UFW) -------------------------------------------------------
# SSH from the founder only; 80/443 from Cloudflare ranges only; nothing else.
# NOTE: Cloudflare reaches the origin on :8443, but the origin firewall opens
# 443 to CF and we DNAT-publish the gateway on the host's 443? No — simpler &
# matches the brief: the gateway host-publishes :8443 and CF connects to :8443
# (a CF-supported origin port). So we open :8443 to Cloudflare ranges only.
echo "== configuring UFW =="
ufw --force reset
ufw default deny incoming
ufw default allow outgoing

if [[ "$FOUNDER_IP" == "any" ]]; then
  ufw allow 22/tcp
  echo "WARNING: SSH open to the world. Re-run with your IP to lock it down."
else
  ufw allow from "$FOUNDER_IP" to any port 22 proto tcp
fi

# Cloudflare published IP ranges -> origin :8443 only. (Refresh from
# https://www.cloudflare.com/ips/ if CF ever changes them.)
CF_V4=(
  173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22
  141.101.64.0/18 108.162.192.0/18 190.93.240.0/20 188.114.96.0/20
  197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13
  104.24.0.0/14 172.64.0.0/13 131.0.72.0/22
)
CF_V6=(
  2400:cb00::/32 2606:4700::/32 2803:f800::/32 2405:b500::/32
  2405:8100::/32 2a06:98c0::/29 2c0f:f248::/32
)
for cidr in "${CF_V4[@]}"; do ufw allow from "$cidr" to any port 8443 proto tcp; done
for cidr in "${CF_V6[@]}"; do ufw allow from "$cidr" to any port 8443 proto tcp; done

ufw --force enable
ufw status verbose

echo
echo "== bootstrap complete =="
echo "Next: copy the repo + a prod .env to this box, then run deploy/02-deploy.sh"
