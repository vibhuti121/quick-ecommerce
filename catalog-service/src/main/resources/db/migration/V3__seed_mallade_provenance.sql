-- MaLLADE provenance seed (B3). The brand sells traceable GI-tagged fruits + honey:
-- every sellable unit carries its provenance under attributes.provenance (farm, origin,
-- harvest, batch, lab-cert, GI-authorization status) — NO schema change, the attributes
-- column is already JSONB. Buyable units are seeded as DISTINCT products (honey 500g vs 1kg
-- are separate SKUs) so the cart/order/checkout contract — which keys lines by productId —
-- stays untouched; variants are seeded only as informational "available grades" for display.
-- Idempotent: skips rows whose SKU already exists, so re-running the migration set is harmless.
--
-- gi.status is one of: "authorized" (UI shows a GI-tagged badge), "pending", or "none"
-- (both render as plain text — never an unearned GI claim). Seed mixes all three on purpose.

INSERT INTO products (sku, name, description, product_type, category, base_price, currency, image_url, attributes, active, created_at, updated_at)
SELECT * FROM (VALUES
    ('MAL-HONEY-COORG-500', 'Coorg Wild Forest Honey — 500g', 'Raw, unprocessed multi-floral honey from the Western Ghats forests of Coorg. Cold-extracted, never heated above hive temperature.',
     'PHYSICAL', 'honey', 549.00, 'INR', 'https://picsum.photos/seed/mal-honey-coorg/600',
     '{"net_weight_grams":500,"floral_source":"wild multi-floral","provenance":{"farm":"Honnavalli Apiary Collective","origin":"Coorg (Kodagu), Karnataka","harvest":"2026-03","batch":"MAL-CWH-2603","labCert":{"ref":"NABL-TC-9921/26","test":"C4 sugar + NMR adulteration panel","status":"passed"},"gi":{"status":"none","name":""}}}'::jsonb, TRUE, now(), now()),

    ('MAL-HONEY-COORG-1000', 'Coorg Wild Forest Honey — 1kg', 'The 1kg jar of our raw multi-floral Coorg forest honey. Same batch and lab-tested purity as the 500g, better value per gram.',
     'PHYSICAL', 'honey', 999.00, 'INR', 'https://picsum.photos/seed/mal-honey-coorg-1k/600',
     '{"net_weight_grams":1000,"floral_source":"wild multi-floral","provenance":{"farm":"Honnavalli Apiary Collective","origin":"Coorg (Kodagu), Karnataka","harvest":"2026-03","batch":"MAL-CWH-2603","labCert":{"ref":"NABL-TC-9921/26","test":"C4 sugar + NMR adulteration panel","status":"passed"},"gi":{"status":"none","name":""}}}'::jsonb, TRUE, now(), now()),

    ('MAL-HONEY-JUNGLE-500', 'Nilgiri Jungle Honey — 500g', 'Dark, robust honey gathered by nomadic beekeepers in the Nilgiri foothills. Distinct malty notes from wild jungle blossom.',
     'PHYSICAL', 'honey', 599.00, 'INR', 'https://picsum.photos/seed/mal-honey-jungle/600',
     '{"net_weight_grams":500,"floral_source":"wild jungle blossom","provenance":{"farm":"Nilgiri Nomadic Beekeepers","origin":"Nilgiri foothills, Tamil Nadu","harvest":"2026-02","batch":"MAL-NJH-2602","labCert":{"ref":"NABL-TC-9944/26","test":"C4 sugar + NMR adulteration panel","status":"passed"},"gi":{"status":"none","name":""}}}'::jsonb, TRUE, now(), now()),

    ('MAL-MANGO-ALPHONSO-BOX', 'Ratnagiri Alphonso Mango — Box of 12', 'Hand-picked, naturally ripened Alphonso (Hapus) from the Konkan coast. Box of 12 premium fruit. GI authorization in process.',
     'PHYSICAL', 'fruit', 1299.00, 'INR', 'https://picsum.photos/seed/mal-mango-alphonso/600',
     '{"pack_count":12,"ripening":"natural (no calcium carbide)","provenance":{"farm":"Konkan Hapus Growers","origin":"Ratnagiri, Maharashtra","harvest":"2026-04","batch":"MAL-RAH-2604","labCert":{"ref":"NABL-TC-1031/26","test":"pesticide residue panel","status":"passed"},"gi":{"status":"pending","name":"Ratnagiri Alphonso (GI)"}}}'::jsonb, TRUE, now(), now()),

    ('MAL-MANGO-GI-BOX', 'Banaganapalle Mango — GI Certified Box of 12', 'GI-tagged Banaganapalle (Benishan) mango sourced from authorized Andhra orchards. Box of 12. Sweet, fibreless, golden flesh.',
     'PHYSICAL', 'fruit', 1099.00, 'INR', 'https://picsum.photos/seed/mal-mango-gi/600',
     '{"pack_count":12,"ripening":"natural (no calcium carbide)","provenance":{"farm":"Nandyal Orchard Federation","origin":"Banaganapalle, Andhra Pradesh","harvest":"2026-05","batch":"MAL-BAN-2605","labCert":{"ref":"NABL-TC-1077/26","test":"pesticide residue panel","status":"passed"},"gi":{"status":"authorized","name":"Banaganapalle Mango (GI)","authNo":"GI-AP-0123"}}}'::jsonb, TRUE, now(), now()),

    ('MAL-LITCHI-SHAHI-BOX', 'Shahi Litchi Muzaffarpur — Box 1kg', 'GI-tagged Shahi litchi from Muzaffarpur, harvested at peak sweetness and cold-chained. 1kg box, thin-skinned with aromatic pulp.',
     'PHYSICAL', 'fruit', 899.00, 'INR', 'https://picsum.photos/seed/mal-litchi-shahi/600',
     '{"net_weight_grams":1000,"cold_chain":true,"provenance":{"farm":"Muzaffarpur Litchi Growers Society","origin":"Muzaffarpur, Bihar","harvest":"2026-05","batch":"MAL-SHL-2605","labCert":{"ref":"NABL-TC-1090/26","test":"pesticide residue panel","status":"passed"},"gi":{"status":"authorized","name":"Shahi Litchi, Muzaffarpur (GI)","authNo":"GI-BR-0045"}}}'::jsonb, TRUE, now(), now())
) AS v(sku, name, description, product_type, category, base_price, currency, image_url, attributes, active, created_at, updated_at)
WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.sku = v.sku);

-- Informational variants ONLY (display "available grades"); add-to-cart stays product-level,
-- so these never become cart line keys. Attached to the Alphonso box to show grade options.
INSERT INTO variants (product_id, sku, name, price_delta, attributes)
SELECT p.id, v.sku, v.name, v.price_delta, v.attributes
FROM products p
JOIN (VALUES
    ('MAL-MANGO-ALPHONSO-BOX', 'MAL-MANGO-ALPHONSO-BOX-A',  'Grade A (200-250g fruit)',  0.00, '{"grade":"A","fruit_weight_grams":"200-250","informational":true}'::jsonb),
    ('MAL-MANGO-ALPHONSO-BOX', 'MAL-MANGO-ALPHONSO-BOX-AA', 'Grade AA (250-300g fruit)', 0.00, '{"grade":"AA","fruit_weight_grams":"250-300","informational":true}'::jsonb)
) AS v(product_sku, sku, name, price_delta, attributes) ON p.sku = v.product_sku
WHERE NOT EXISTS (SELECT 1 FROM variants ev WHERE ev.sku = v.sku);
