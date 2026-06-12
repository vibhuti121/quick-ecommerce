-- Capture WHERE a COD order is delivered, beyond the free-text delivery_address: the storefront now
-- resolves city/state from a 6-digit pincode (offline tables + a postal API, capital-as-city fallback)
-- and sends all three at checkout. Columns are NOT NULL DEFAULT '' so any pre-existing order rows stay
-- valid; the app's @NotBlank validation enforces real values on every new order. VARCHAR(128) covers the
-- longest Indian state/UT and district names; pincode is the fixed 6-digit string.
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS pincode VARCHAR(6)   NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS city    VARCHAR(128) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS state   VARCHAR(128) NOT NULL DEFAULT '';
