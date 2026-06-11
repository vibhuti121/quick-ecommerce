#!/bin/sh
# Generate the dev self-signed TLS keystore at CONTAINER START — not at image build — so the keystore
# password never lands in a build ARG or image layer / `docker history` (remediates DS-0031). The
# password is read from the runtime environment (.env via docker-compose) and must match what Spring
# uses to open the keystore (gateway application.yml: server.ssl.key-store-password).
#
# A real deployment instead mounts a CA-signed PKCS12 over /app/keystore.p12, sets the matching
# TLS_KEYSTORE_PASSWORD, and sets TLS_REGENERATE_KEYSTORE=false so the mounted cert is left untouched.
set -eu

: "${TLS_KEYSTORE_PASSWORD:?TLS_KEYSTORE_PASSWORD is required - run ./scripts/gen-secrets.sh to create .env}"

KEYSTORE=/app/keystore.p12

# Regenerate the throwaway dev cert on every start so it always matches the current password (cheap,
# ~1s). If an operator has mounted their own keystore, leave it untouched.
# Remove any existing keystore first: keytool -genkeypair APPENDS to an existing PKCS12, so on a
# container RESTART (the writable layer still holds the previous /app/keystore.p12) it would fail with
# "alias <gateway> already exists" and set -eu would crash-loop the container. rm makes it idempotent.
if [ ! -f "$KEYSTORE" ] || [ "${TLS_REGENERATE_KEYSTORE:-true}" = "true" ]; then
  rm -f "$KEYSTORE"
  keytool -genkeypair -alias gateway -keyalg RSA -keysize 2048 -validity 825 \
    -storetype PKCS12 -keystore "$KEYSTORE" -storepass "$TLS_KEYSTORE_PASSWORD" \
    -dname "CN=localhost,OU=dev,O=quick-ecommerce,L=Bengaluru,C=IN" \
    -ext "SAN=dns:localhost,dns:gateway,ip:127.0.0.1"
fi

exec java -jar /app/app.jar
