-- Seed stock for the catalog seed SKUs so the end-to-end checkout journey has stock to reserve.
INSERT INTO stock_items (sku, available_qty, reserved_qty, version, updated_at)
SELECT * FROM (VALUES
    ('PHY-TSHIRT-001', 100, 0, 0, now()),
    ('DIG-EBOOK-001',  999, 0, 0, now()),
    ('SVC-CLEAN-001',   20, 0, 0, now()),
    ('SUB-STREAM-001', 999, 0, 0, now()),
    ('RENT-DRILL-001',   5, 0, 0, now())
) AS v(sku, available_qty, reserved_qty, version, updated_at)
WHERE NOT EXISTS (SELECT 1 FROM stock_items s WHERE s.sku = v.sku);
