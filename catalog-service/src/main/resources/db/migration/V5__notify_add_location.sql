-- Capture WHERE a launch-interest signup is, so the founder can see demand by geography before a drop.
-- The storefront resolves city/state from the entered 6-digit pincode (offline tables + a postal API,
-- capital-as-city fallback), then sends all three. Columns are NULLABLE: this is additive and the few
-- pre-existing signups (pre-pincode) legitimately have none. VARCHAR(128) comfortably covers the longest
-- Indian state/UT and district names; pincode is the fixed 6-digit string.
-- Idempotent DDL (IF NOT EXISTS), consistent with the rest of the migration set.

ALTER TABLE notify_signups
    ADD COLUMN IF NOT EXISTS pincode VARCHAR(6),
    ADD COLUMN IF NOT EXISTS city    VARCHAR(128),
    ADD COLUMN IF NOT EXISTS state   VARCHAR(128);
