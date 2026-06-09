#!/bin/sh
# Generate the nginx basic-auth file from env at container start, so no credential is baked into the
# image (mirrors how the gateway derives its TLS keystore from an env secret). The official nginx image
# runs every *.sh in /docker-entrypoint.d/ before exec'ing nginx, so dropping this there is enough.
#
# Fail closed: if ADMIN_PASSWORD is unset the container refuses to start rather than serving the admin
# console with no password.
set -e

if [ -z "$ADMIN_PASSWORD" ]; then
  echo "admin-app: ADMIN_PASSWORD is required (set it in .env) — refusing to start." >&2
  exit 1
fi

ADMIN_USER="${ADMIN_USER:-admin}"
htpasswd -bc /etc/nginx/.htpasswd "$ADMIN_USER" "$ADMIN_PASSWORD" >/dev/null 2>&1
echo "admin-app: basic-auth configured for user '$ADMIN_USER'"
