#!/bin/bash
# Runs once on first Postgres init (mounted into /docker-entrypoint-initdb.d). Creates one database
# per microservice so each service owns its own schema — no cross-service joins. Data lives in the
# named volume, so these survive container restarts; the init only re-runs on a fresh volume.
set -euo pipefail

for db in authdb catalogdb inventorydb paymentdb orderdb videocalldb; do
  echo "creating database: $db"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    SELECT 'CREATE DATABASE $db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$db')\gexec
EOSQL
done
