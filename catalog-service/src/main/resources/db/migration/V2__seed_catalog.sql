-- Seed data that exercises every product_type and shows the JSONB `attributes`
-- carrying kind-specific fields with no schema change. Idempotent: skips rows
-- whose SKU already exists, so re-running the migration set is harmless.

INSERT INTO products (sku, name, description, product_type, category, base_price, currency, image_url, attributes, active, created_at, updated_at)
SELECT * FROM (VALUES
    ('PHY-TSHIRT-001', 'Cotton Round-Neck T-Shirt', 'Soft combed-cotton everyday tee.',
     'PHYSICAL', 'apparel', 499.00, 'INR', 'https://picsum.photos/seed/tshirt/600',
     '{"material":"100% cotton","weight_grams":180,"care":"machine wash cold"}'::jsonb, TRUE, now(), now()),

    ('DIG-EBOOK-001', 'Designing Data-Intensive Applications (eBook)', 'DRM-free PDF + EPUB download.',
     'DIGITAL', 'books', 799.00, 'INR', 'https://picsum.photos/seed/ebook/600',
     '{"formats":["pdf","epub"],"pages":616,"download_limit":5,"drm":false}'::jsonb, TRUE, now(), now()),

    ('SVC-CLEAN-001', 'Home Deep-Cleaning (2 BHK)', 'Professional 3-hour deep clean, supplies included.',
     'SERVICE', 'home-services', 1999.00, 'INR', 'https://picsum.photos/seed/cleaning/600',
     '{"duration_minutes":180,"crew_size":2,"booking_required":true,"service_area":["Bangalore"]}'::jsonb, TRUE, now(), now()),

    ('SUB-STREAM-001', 'StreamPlus Monthly', 'Ad-free streaming, cancel anytime.',
     'SUBSCRIPTION', 'media', 299.00, 'INR', 'https://picsum.photos/seed/stream/600',
     '{"billing_cycle":"monthly","trial_days":7,"max_screens":4,"auto_renew":true}'::jsonb, TRUE, now(), now()),

    ('RENT-DRILL-001', 'Cordless Drill (Daily Rental)', '18V cordless drill with 2 batteries.',
     'RENTAL', 'tools', 149.00, 'INR', 'https://picsum.photos/seed/drill/600',
     '{"rental_unit":"day","deposit":1500,"min_days":1,"max_days":30}'::jsonb, TRUE, now(), now())
) AS v(sku, name, description, product_type, category, base_price, currency, image_url, attributes, active, created_at, updated_at)
WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.sku = v.sku);

-- One product with size variants, to exercise the variants table.
INSERT INTO variants (product_id, sku, name, price_delta, attributes)
SELECT p.id, v.sku, v.name, v.price_delta, v.attributes
FROM products p
JOIN (VALUES
    ('PHY-TSHIRT-001', 'PHY-TSHIRT-001-S', 'Small',  0.00, '{"size":"S"}'::jsonb),
    ('PHY-TSHIRT-001', 'PHY-TSHIRT-001-M', 'Medium', 0.00, '{"size":"M"}'::jsonb),
    ('PHY-TSHIRT-001', 'PHY-TSHIRT-001-L', 'Large', 50.00, '{"size":"L"}'::jsonb)
) AS v(product_sku, sku, name, price_delta, attributes) ON p.sku = v.product_sku
WHERE NOT EXISTS (SELECT 1 FROM variants ev WHERE ev.sku = v.sku);
