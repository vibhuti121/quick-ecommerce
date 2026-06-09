-- Stock for the V3 catalog SKUs so the newly-seeded products are fully shoppable (checkout reserves
-- inventory). Same idempotent guard as V2. Stock sized by type: physical/rental modest fleets,
-- digital/subscription effectively unlimited, service limited daily capacity.
INSERT INTO stock_items (sku, available_qty, reserved_qty, version, updated_at)
SELECT * FROM (VALUES
    -- PHYSICAL
    ('PHY-MUG-002',      200, 0, 0, now()),
    ('PHY-BOTTLE-003',   150, 0, 0, now()),
    ('PHY-HOODIE-004',    80, 0, 0, now()),
    ('PHY-SNEAKER-005',   60, 0, 0, now()),
    ('PHY-EARBUDS-006',  120, 0, 0, now()),
    ('PHY-LAMP-007',      90, 0, 0, now()),
    ('PHY-BACKPACK-008',  70, 0, 0, now()),
    ('PHY-YOGAMAT-009',  110, 0, 0, now()),
    ('PHY-NOTEBOOK-010', 300, 0, 0, now()),
    -- DIGITAL (effectively unlimited)
    ('DIG-COURSE-002',    999, 0, 0, now()),
    ('DIG-LICENSE-003',   999, 0, 0, now()),
    ('DIG-PRESET-004',    999, 0, 0, now()),
    ('DIG-AUDIOBOOK-005', 999, 0, 0, now()),
    ('DIG-FONT-006',      999, 0, 0, now()),
    ('DIG-TEMPLATE-007',  999, 0, 0, now()),
    ('DIG-GAME-008',      999, 0, 0, now()),
    ('DIG-ICONS-009',     999, 0, 0, now()),
    ('DIG-EBOOK-010',     999, 0, 0, now()),
    -- SERVICE (limited daily capacity)
    ('SVC-PLUMB-002',     25, 0, 0, now()),
    ('SVC-ELEC-003',      25, 0, 0, now()),
    ('SVC-PAINT-004',     10, 0, 0, now()),
    ('SVC-SALON-005',     30, 0, 0, now()),
    ('SVC-MASSAGE-006',   20, 0, 0, now()),
    ('SVC-PEST-007',      15, 0, 0, now()),
    ('SVC-CARWASH-008',   30, 0, 0, now()),
    ('SVC-TUTOR-009',     40, 0, 0, now()),
    ('SVC-PHOTO-010',     12, 0, 0, now()),
    -- SUBSCRIPTION (effectively unlimited / large)
    ('SUB-NEWS-002',      999, 0, 0, now()),
    ('SUB-MUSIC-003',     999, 0, 0, now()),
    ('SUB-CLOUD-004',     999, 0, 0, now()),
    ('SUB-GYM-005',       500, 0, 0, now()),
    ('SUB-MEALKIT-006',   300, 0, 0, now()),
    ('SUB-VPN-007',       999, 0, 0, now()),
    ('SUB-AUDIO-008',     999, 0, 0, now()),
    ('SUB-LEARN-009',     999, 0, 0, now()),
    ('SUB-COFFEE-010',    400, 0, 0, now()),
    -- RENTAL (small fleets)
    ('RENT-TENT-002',      15, 0, 0, now()),
    ('RENT-CAMERA-003',     8, 0, 0, now()),
    ('RENT-PROJECTOR-004', 10, 0, 0, now()),
    ('RENT-BIKE-005',      20, 0, 0, now()),
    ('RENT-SCOOTER-006',   12, 0, 0, now()),
    ('RENT-PRESSURE-007',  10, 0, 0, now()),
    ('RENT-LADDER-008',    25, 0, 0, now()),
    ('RENT-SPEAKER-009',    6, 0, 0, now()),
    ('RENT-GAZEBO-010',     8, 0, 0, now())
) AS v(sku, available_qty, reserved_qty, version, updated_at)
WHERE NOT EXISTS (SELECT 1 FROM stock_items s WHERE s.sku = v.sku);
