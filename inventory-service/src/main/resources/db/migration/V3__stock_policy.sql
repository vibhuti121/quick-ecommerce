-- Stock policy: how a SKU is fulfilled, orthogonal to catalog's "what it is" (category/GI).
-- Backward-compatible: every existing row defaults to FINITE = today's behaviour exactly.
-- VARCHAR(16) sized to the longest literal ('COMING_SOON' = 11) with headroom; CHECK pins the set
-- so a bad value crash-fails at write, not at dispatch.  (cf. migration-not-run-by-build-gate:
-- size VARCHAR to the longest enum literal.)
ALTER TABLE stock_items
    ADD COLUMN IF NOT EXISTS stock_policy VARCHAR(16) NOT NULL DEFAULT 'FINITE';

ALTER TABLE stock_items
    ADD CONSTRAINT chk_stock_items_policy
    CHECK (stock_policy IN ('FINITE', 'COMING_SOON', 'INFINITE', 'BACKORDER'));
