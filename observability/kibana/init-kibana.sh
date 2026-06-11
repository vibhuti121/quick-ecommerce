#!/bin/sh
# One-shot Kibana bootstrap for the QuickCart forensic UX (observability Pillar 2).
#
# Waits for the Kibana API to report `available`, then imports the forensic saved objects:
#   - data view   `logs-quickcart`  (id: quickcart-logs)
#   - saved search "QuickCart — journey by trace.id / user_id" (id: quickcart-journey-by-trace)
#
# So an on-call resolving a "Rs450 deducted, no order" dispute opens that saved search and filters
# `traceId:"<id>"` (or `user_id:"<hash>"`) to get the ordered cross-service timeline.
#
# Best-effort + non-blocking: NOTHING depends on this service. If Kibana is slow or the import fails,
# the stack is unaffected — the logs are still in ES and a data view can be added by hand. _import with
# overwrite=true is idempotent, so this is safe to leave wired into every `up`.
set -eu

KB="${KIBANA_URL:-http://kibana:5601}"

echo "kibana-init: waiting for Kibana API to become available..."
i=0
until [ "$(curl -fs "$KB/api/status" 2>/dev/null | sed -n 's/.*"overall":{"level":"\([a-z]*\)".*/\1/p')" = "available" ]; do
  i=$((i+1)); [ "$i" -gt 90 ] && { echo "kibana-init: Kibana not available after ~3m, skipping (non-fatal)"; exit 0; }
  sleep 2
done

echo "kibana-init: importing forensic saved objects..."
# overwrite=true makes the import idempotent across boots; createNewCopies=false keeps the fixed ids so
# the saved-search -> data-view reference resolves deterministically.
curl -fs -X POST "$KB/api/saved_objects/_import?overwrite=true" \
  -H 'kbn-xsrf: true' \
  -F file=@/import/forensic-objects.ndjson \
  | sed -n 's/.*\("success":[a-z]*\).*/kibana-init: \1/p' || {
    echo "kibana-init: import failed (non-fatal) — add the logs-quickcart data view manually"; exit 0;
  }

echo "kibana-init: done."
