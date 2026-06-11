#!/bin/sh
# One-shot Elasticsearch bootstrap for the QuickCart log pipeline (observability Pillar 2).
#
# Runs as the `es-init` compose service AFTER elasticsearch is healthy, then exits. It PUTs three
# idempotent objects that turn the raw shipped logs into a PII-safe, retention-tiered, queryable
# forensic store:
#   1. ingest pipeline  `quickcart-pii-mask`   — defense-in-depth masking of any stray card/phone/email
#   2. ILM policy       `quickcart-logs-ilm`    — hot 7d -> warm 30d -> cold 1y -> delete
#   3. index template   `logs-quickcart`        — binds the data stream to the policy + default pipeline
#
# Every call is a PUT (idempotent): re-running on an existing cluster just overwrites with the same body,
# so this is safe to leave wired into `docker compose up` on every boot.
set -eu

ES="${ES_URL:-http://elasticsearch:9200}"

echo "es-init: waiting for $ES to go green/yellow..."
# ES healthcheck already gates depends_on, but wait defensively for the cluster API to answer.
i=0
until curl -fs "$ES/_cluster/health" >/dev/null 2>&1; do
  i=$((i+1)); [ "$i" -gt 60 ] && { echo "es-init: ES never answered"; exit 1; }
  sleep 2
done

echo "es-init: PUT ingest pipeline quickcart-pii-mask"
# Masking runs in ES on EVERY log doc (set as the data stream's default_pipeline). It is a safety net for
# an accidental raw-PII string in a `message` — the primary defense is not logging PII in the first place
# (user_id is hashed at the service, increment 2B). Order: email, then phone (10-digit), then card
# (13-19 digit) so a phone is not partially eaten by the card pattern. Applied to `message` only — the
# structured fields (trace.id/service/level) are never PII.
curl -fs -X PUT "$ES/_ingest/pipeline/quickcart-pii-mask" -H 'Content-Type: application/json' -d '{
  "description": "Defense-in-depth PII masking for QuickCart logs (card/phone/email)",
  "processors": [
    { "gsub": { "field": "message", "pattern": "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}", "replacement": "[EMAIL_REDACTED]", "ignore_missing": true } },
    { "gsub": { "field": "message", "pattern": "(\\+?91[ -]?)?[6-9]\\d{9}", "replacement": "[PHONE_REDACTED]", "ignore_missing": true } },
    { "gsub": { "field": "message", "pattern": "\\b(?:\\d[ -]?){13,19}\\b", "replacement": "[CARD_REDACTED]", "ignore_missing": true } }
  ],
  "on_failure": [ { "set": { "field": "pii_mask_error", "value": "{{ _ingest.on_failure_message }}" } } ]
}' >/dev/null && echo "  ok"

echo "es-init: PUT ILM policy quickcart-logs-ilm"
# Retention tiers for the dispute trail: a "Rs450 deducted, no order" query 2 weeks (or 11 months) later
# still finds the journey. Single-node dev has no warm/cold data nodes, so we only shift priority (no
# allocate routing) — the phase ages + the 1y delete are what matter. A managed go-live swaps in real tiers.
curl -fs -X PUT "$ES/_ilm/policy/quickcart-logs-ilm" -H 'Content-Type: application/json' -d '{
  "policy": {
    "phases": {
      "hot":    { "min_age": "0ms",  "actions": { "rollover": { "max_age": "7d", "max_primary_shard_size": "5gb" }, "set_priority": { "priority": 100 } } },
      "warm":   { "min_age": "7d",   "actions": { "set_priority": { "priority": 50 } } },
      "cold":   { "min_age": "30d",  "actions": { "set_priority": { "priority": 0 } } },
      "delete": { "min_age": "365d", "actions": { "delete": {} } }
    }
  }
}' >/dev/null && echo "  ok"

echo "es-init: PUT index template logs-quickcart"
# Binds the `logs-quickcart` data stream to the ILM policy + masking pipeline, and keyword-maps the
# fields the forensic view filters on (trace.id / user_id / service). replicas=0 keeps single-node green.
curl -fs -X PUT "$ES/_index_template/logs-quickcart" -H 'Content-Type: application/json' -d '{
  "index_patterns": ["logs-quickcart"],
  "data_stream": {},
  "priority": 200,
  "template": {
    "settings": {
      "index.number_of_replicas": 0,
      "index.lifecycle.name": "quickcart-logs-ilm",
      "index.default_pipeline": "quickcart-pii-mask"
    },
    "mappings": {
      "properties": {
        "@timestamp": { "type": "date" },
        "timestamp":  { "type": "date" },
        "service":    { "type": "keyword" },
        "level":      { "type": "keyword" },
        "logger_name":{ "type": "keyword" },
        "trace.id":   { "type": "keyword" },
        "span.id":    { "type": "keyword" },
        "traceId":    { "type": "keyword" },
        "spanId":     { "type": "keyword" },
        "user_id":    { "type": "keyword" },
        "event":      { "type": "keyword" },
        "message":    { "type": "text" }
      }
    }
  }
}' >/dev/null && echo "  ok"

# Create the data stream up-front so the very first Filebeat write lands in a correctly-templated stream.
curl -fs -X PUT "$ES/_data_stream/logs-quickcart" >/dev/null 2>&1 || true

echo "es-init: done."
