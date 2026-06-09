-- Expand the catalog so every product_type has ~10 products (the V2 seed gives 1 each; this adds 9
-- more per type = 45 rows). Same idempotent pattern as V2 (skip rows whose SKU already exists), and
-- still no schema change — kind-specific fields ride in the JSONB `attributes` column.

INSERT INTO products (sku, name, description, product_type, category, base_price, currency, image_url, attributes, active, created_at, updated_at)
SELECT * FROM (VALUES
    -- ---- PHYSICAL (apparel / kitchen / electronics / home / fitness …) ----
    ('PHY-MUG-002', 'Ceramic Coffee Mug 350ml', 'Glazed stoneware mug, microwave and dishwasher safe.',
     'PHYSICAL', 'kitchen', 249.00, 'INR', 'https://picsum.photos/seed/mug/600',
     '{"material":"stoneware","weight_grams":320,"care":"dishwasher safe"}'::jsonb, TRUE, now(), now()),

    ('PHY-BOTTLE-003', 'Stainless Steel Water Bottle 1L', 'Double-wall vacuum flask, keeps drinks cold 24h.',
     'PHYSICAL', 'kitchen', 599.00, 'INR', 'https://picsum.photos/seed/bottle/600',
     '{"material":"304 stainless steel","weight_grams":380,"care":"hand wash"}'::jsonb, TRUE, now(), now()),

    ('PHY-HOODIE-004', 'Fleece Pullover Hoodie', 'Brushed-fleece hoodie with kangaroo pocket.',
     'PHYSICAL', 'apparel', 1299.00, 'INR', 'https://picsum.photos/seed/hoodie/600',
     '{"material":"cotton-poly fleece","weight_grams":540,"care":"machine wash cold"}'::jsonb, TRUE, now(), now()),

    ('PHY-SNEAKER-005', 'Everyday Running Sneakers', 'Lightweight mesh sneakers with cushioned sole.',
     'PHYSICAL', 'apparel', 2499.00, 'INR', 'https://picsum.photos/seed/sneaker/600',
     '{"material":"mesh upper","weight_grams":620,"care":"wipe clean"}'::jsonb, TRUE, now(), now()),

    ('PHY-EARBUDS-006', 'Wireless Bluetooth Earbuds', 'In-ear buds with charging case and 24h battery.',
     'PHYSICAL', 'electronics', 1999.00, 'INR', 'https://picsum.photos/seed/earbuds/600',
     '{"material":"abs plastic","weight_grams":58,"care":"keep dry"}'::jsonb, TRUE, now(), now()),

    ('PHY-LAMP-007', 'LED Desk Lamp Dimmable', 'Touch-dimmable desk lamp with three colour modes.',
     'PHYSICAL', 'home', 899.00, 'INR', 'https://picsum.photos/seed/lamp/600',
     '{"material":"aluminium","weight_grams":700,"care":"wipe clean"}'::jsonb, TRUE, now(), now()),

    ('PHY-BACKPACK-008', 'Water-Resistant Laptop Backpack', 'Padded 15-inch laptop bag with USB pass-through.',
     'PHYSICAL', 'accessories', 1599.00, 'INR', 'https://picsum.photos/seed/backpack/600',
     '{"material":"polyester","weight_grams":820,"care":"spot clean"}'::jsonb, TRUE, now(), now()),

    ('PHY-YOGAMAT-009', 'Non-Slip Yoga Mat 6mm', 'Cushioned TPE mat with alignment lines.',
     'PHYSICAL', 'fitness', 799.00, 'INR', 'https://picsum.photos/seed/yogamat/600',
     '{"material":"TPE foam","weight_grams":900,"care":"wipe clean"}'::jsonb, TRUE, now(), now()),

    ('PHY-NOTEBOOK-010', 'Hardcover Dotted Notebook A5', '160-page dotted notebook with elastic closure.',
     'PHYSICAL', 'stationery', 349.00, 'INR', 'https://picsum.photos/seed/notebook/600',
     '{"material":"paper","weight_grams":300,"care":"keep dry"}'::jsonb, TRUE, now(), now()),

    -- ---- DIGITAL (books / software / media / courses / design …) ----
    ('DIG-COURSE-002', 'Full-Stack Web Dev Course', 'Lifetime access to 40 hours of video lessons.',
     'DIGITAL', 'courses', 1499.00, 'INR', 'https://picsum.photos/seed/course/600',
     '{"formats":["mp4"],"hours":40,"download_limit":3,"drm":false}'::jsonb, TRUE, now(), now()),

    ('DIG-LICENSE-003', 'Pro Photo Editor License', 'One-year license key for the desktop photo editor.',
     'DIGITAL', 'software', 2999.00, 'INR', 'https://picsum.photos/seed/license/600',
     '{"formats":["license-key"],"seats":1,"download_limit":5,"drm":true}'::jsonb, TRUE, now(), now()),

    ('DIG-PRESET-004', 'Cinematic Lightroom Presets', 'Pack of 30 cinematic colour-grade presets.',
     'DIGITAL', 'media', 499.00, 'INR', 'https://picsum.photos/seed/preset/600',
     '{"formats":["xmp","dng"],"count":30,"download_limit":5,"drm":false}'::jsonb, TRUE, now(), now()),

    ('DIG-AUDIOBOOK-005', 'Atomic Habits Audiobook', 'Unabridged narration, DRM-free MP3 download.',
     'DIGITAL', 'books', 699.00, 'INR', 'https://picsum.photos/seed/audiobook/600',
     '{"formats":["mp3"],"hours":5,"download_limit":5,"drm":false}'::jsonb, TRUE, now(), now()),

    ('DIG-FONT-006', 'Variable Font Family', 'Desktop and web licence for a 9-weight variable font.',
     'DIGITAL', 'design', 1299.00, 'INR', 'https://picsum.photos/seed/font/600',
     '{"formats":["otf","woff2"],"weights":9,"download_limit":5,"drm":false}'::jsonb, TRUE, now(), now()),

    ('DIG-TEMPLATE-007', 'Resume & Portfolio Template Kit', 'Editable resume and portfolio templates.',
     'DIGITAL', 'design', 399.00, 'INR', 'https://picsum.photos/seed/template/600',
     '{"formats":["docx","figma"],"count":12,"download_limit":5,"drm":false}'::jsonb, TRUE, now(), now()),

    ('DIG-GAME-008', 'Indie Puzzle Game', 'PC download key for an award-winning puzzle game.',
     'DIGITAL', 'games', 899.00, 'INR', 'https://picsum.photos/seed/game/600',
     '{"formats":["pc-download"],"size_gb":4,"download_limit":3,"drm":true}'::jsonb, TRUE, now(), now()),

    ('DIG-ICONS-009', '2000-Icon UI Pack', 'Two thousand line and solid icons in SVG.',
     'DIGITAL', 'design', 599.00, 'INR', 'https://picsum.photos/seed/icons/600',
     '{"formats":["svg","png"],"count":2000,"download_limit":5,"drm":false}'::jsonb, TRUE, now(), now()),

    ('DIG-EBOOK-010', 'Clean Code eBook', 'DRM-free PDF and EPUB of the software classic.',
     'DIGITAL', 'books', 749.00, 'INR', 'https://picsum.photos/seed/cleancode/600',
     '{"formats":["pdf","epub"],"pages":464,"download_limit":5,"drm":false}'::jsonb, TRUE, now(), now()),

    -- ---- SERVICE (home-services / wellness / beauty / education …) ----
    ('SVC-PLUMB-002', 'Plumbing Repair Visit', 'Leak and fixture repair, parts billed separately.',
     'SERVICE', 'home-services', 799.00, 'INR', 'https://picsum.photos/seed/plumbing/600',
     '{"duration_minutes":60,"crew_size":1,"booking_required":true,"service_area":["Bangalore"]}'::jsonb, TRUE, now(), now()),

    ('SVC-ELEC-003', 'Electrical Fitting & Repair', 'Switches, fans and wiring fixes by a certified electrician.',
     'SERVICE', 'home-services', 899.00, 'INR', 'https://picsum.photos/seed/electric/600',
     '{"duration_minutes":75,"crew_size":1,"booking_required":true,"service_area":["Bangalore"]}'::jsonb, TRUE, now(), now()),

    ('SVC-PAINT-004', '1-BHK Wall Painting', 'Two-coat emulsion painting for a 1-BHK home.',
     'SERVICE', 'home-services', 5999.00, 'INR', 'https://picsum.photos/seed/painting/600',
     '{"duration_minutes":480,"crew_size":3,"booking_required":true,"service_area":["Bangalore","Pune"]}'::jsonb, TRUE, now(), now()),

    ('SVC-SALON-005', 'At-Home Salon Haircut & Styling', 'Professional haircut and styling at your doorstep.',
     'SERVICE', 'beauty', 699.00, 'INR', 'https://picsum.photos/seed/salon/600',
     '{"duration_minutes":60,"crew_size":1,"booking_required":true,"service_area":["Bangalore"]}'::jsonb, TRUE, now(), now()),

    ('SVC-MASSAGE-006', 'Full-Body Relaxation Massage', 'Sixty-minute relaxation massage with oils included.',
     'SERVICE', 'wellness', 1499.00, 'INR', 'https://picsum.photos/seed/massage/600',
     '{"duration_minutes":60,"crew_size":1,"booking_required":true,"service_area":["Bangalore"]}'::jsonb, TRUE, now(), now()),

    ('SVC-PEST-007', 'Pest Control Treatment', 'General pest treatment for a 2-BHK home.',
     'SERVICE', 'home-services', 1299.00, 'INR', 'https://picsum.photos/seed/pest/600',
     '{"duration_minutes":90,"crew_size":2,"booking_required":true,"service_area":["Bangalore"]}'::jsonb, TRUE, now(), now()),

    ('SVC-CARWASH-008', 'Doorstep Car Wash & Detailing', 'Exterior wash, interior vacuum and wax.',
     'SERVICE', 'auto', 599.00, 'INR', 'https://picsum.photos/seed/carwash/600',
     '{"duration_minutes":60,"crew_size":2,"booking_required":true,"service_area":["Bangalore"]}'::jsonb, TRUE, now(), now()),

    ('SVC-TUTOR-009', 'Math Tutoring Session', 'One-hour personalised online or home maths session.',
     'SERVICE', 'education', 499.00, 'INR', 'https://picsum.photos/seed/tutor/600',
     '{"duration_minutes":60,"crew_size":1,"booking_required":true,"service_area":["Online"]}'::jsonb, TRUE, now(), now()),

    ('SVC-PHOTO-010', 'Portfolio Photoshoot', 'One-hour studio or location portrait shoot.',
     'SERVICE', 'events', 2999.00, 'INR', 'https://picsum.photos/seed/photoshoot/600',
     '{"duration_minutes":60,"crew_size":1,"booking_required":true,"service_area":["Bangalore"]}'::jsonb, TRUE, now(), now()),

    -- ---- SUBSCRIPTION (media / software / fitness / news / food …) ----
    ('SUB-NEWS-002', 'DailyHerald News Plus', 'Ad-free news and long-reads, billed monthly.',
     'SUBSCRIPTION', 'news', 199.00, 'INR', 'https://picsum.photos/seed/news/600',
     '{"billing_cycle":"monthly","trial_days":14,"devices":5,"auto_renew":true}'::jsonb, TRUE, now(), now()),

    ('SUB-MUSIC-003', 'SoundWave Music Premium', 'Ad-free music streaming with offline downloads.',
     'SUBSCRIPTION', 'media', 149.00, 'INR', 'https://picsum.photos/seed/music/600',
     '{"billing_cycle":"monthly","trial_days":30,"max_screens":1,"auto_renew":true}'::jsonb, TRUE, now(), now()),

    ('SUB-CLOUD-004', 'CloudVault 1TB Storage', 'One terabyte of encrypted cloud storage, monthly.',
     'SUBSCRIPTION', 'software', 299.00, 'INR', 'https://picsum.photos/seed/cloud/600',
     '{"billing_cycle":"monthly","trial_days":7,"storage_gb":1024,"auto_renew":true}'::jsonb, TRUE, now(), now()),

    ('SUB-GYM-005', 'FitClub Gym Membership', 'Unlimited access to partner gyms, billed monthly.',
     'SUBSCRIPTION', 'fitness', 999.00, 'INR', 'https://picsum.photos/seed/gym/600',
     '{"billing_cycle":"monthly","trial_days":3,"locations":40,"auto_renew":true}'::jsonb, TRUE, now(), now()),

    ('SUB-MEALKIT-006', 'FreshBox Weekly Meal Kit', 'Chef-designed recipes and ingredients each week.',
     'SUBSCRIPTION', 'food', 1799.00, 'INR', 'https://picsum.photos/seed/mealkit/600',
     '{"billing_cycle":"weekly","trial_days":0,"meals_per_week":4,"auto_renew":true}'::jsonb, TRUE, now(), now()),

    ('SUB-VPN-007', 'SecureNet VPN Annual', 'Encrypted VPN across unlimited devices, billed yearly.',
     'SUBSCRIPTION', 'software', 2499.00, 'INR', 'https://picsum.photos/seed/vpn/600',
     '{"billing_cycle":"annual","trial_days":7,"devices":10,"auto_renew":true}'::jsonb, TRUE, now(), now()),

    ('SUB-AUDIO-008', 'AudioShelf Audiobooks', 'One audiobook credit every month plus member deals.',
     'SUBSCRIPTION', 'media', 399.00, 'INR', 'https://picsum.photos/seed/audioshelf/600',
     '{"billing_cycle":"monthly","trial_days":30,"credits_per_month":1,"auto_renew":true}'::jsonb, TRUE, now(), now()),

    ('SUB-LEARN-009', 'SkillUp Learning Annual', 'Unlimited online courses and certificates, yearly.',
     'SUBSCRIPTION', 'education', 3999.00, 'INR', 'https://picsum.photos/seed/skillup/600',
     '{"billing_cycle":"annual","trial_days":7,"courses":"unlimited","auto_renew":true}'::jsonb, TRUE, now(), now()),

    ('SUB-COFFEE-010', 'DailyGrind Coffee Club', 'Fresh-roasted beans delivered monthly.',
     'SUBSCRIPTION', 'food', 599.00, 'INR', 'https://picsum.photos/seed/coffeeclub/600',
     '{"billing_cycle":"monthly","trial_days":0,"bags_per_month":1,"auto_renew":true}'::jsonb, TRUE, now(), now()),

    -- ---- RENTAL (tools / vehicles / electronics / events …) ----
    ('RENT-TENT-002', '4-Person Camping Tent', 'Weatherproof dome tent, daily rental.',
     'RENTAL', 'outdoor', 299.00, 'INR', 'https://picsum.photos/seed/tent/600',
     '{"rental_unit":"day","deposit":1000,"min_days":1,"max_days":30}'::jsonb, TRUE, now(), now()),

    ('RENT-CAMERA-003', 'DSLR Camera Kit', 'DSLR body with two lenses and bag, daily rental.',
     'RENTAL', 'electronics', 799.00, 'INR', 'https://picsum.photos/seed/camera/600',
     '{"rental_unit":"day","deposit":8000,"min_days":1,"max_days":14}'::jsonb, TRUE, now(), now()),

    ('RENT-PROJECTOR-004', 'Full-HD Projector', '1080p projector with HDMI, daily rental.',
     'RENTAL', 'electronics', 499.00, 'INR', 'https://picsum.photos/seed/projector/600',
     '{"rental_unit":"day","deposit":4000,"min_days":1,"max_days":14}'::jsonb, TRUE, now(), now()),

    ('RENT-BIKE-005', 'Mountain Bike', '21-speed mountain bike with helmet, daily rental.',
     'RENTAL', 'vehicles', 399.00, 'INR', 'https://picsum.photos/seed/mtb/600',
     '{"rental_unit":"day","deposit":3000,"min_days":1,"max_days":30}'::jsonb, TRUE, now(), now()),

    ('RENT-SCOOTER-006', 'Electric Scooter', 'City e-scooter with charger, daily rental.',
     'RENTAL', 'vehicles', 349.00, 'INR', 'https://picsum.photos/seed/escooter/600',
     '{"rental_unit":"day","deposit":5000,"min_days":1,"max_days":30}'::jsonb, TRUE, now(), now()),

    ('RENT-PRESSURE-007', 'Pressure Washer', 'High-pressure washer for cars and patios, daily rental.',
     'RENTAL', 'tools', 449.00, 'INR', 'https://picsum.photos/seed/pressurewasher/600',
     '{"rental_unit":"day","deposit":2500,"min_days":1,"max_days":14}'::jsonb, TRUE, now(), now()),

    ('RENT-LADDER-008', 'Aluminium Ladder 12ft', 'Foldable 12-foot ladder, daily rental.',
     'RENTAL', 'tools', 199.00, 'INR', 'https://picsum.photos/seed/ladder/600',
     '{"rental_unit":"day","deposit":1500,"min_days":1,"max_days":30}'::jsonb, TRUE, now(), now()),

    ('RENT-SPEAKER-009', 'Party PA Speaker System', 'Powered PA speakers with mic, daily rental.',
     'RENTAL', 'events', 1299.00, 'INR', 'https://picsum.photos/seed/paspeaker/600',
     '{"rental_unit":"day","deposit":6000,"min_days":1,"max_days":7}'::jsonb, TRUE, now(), now()),

    ('RENT-GAZEBO-010', 'Event Gazebo 3x3m', 'Pop-up event gazebo with side walls, daily rental.',
     'RENTAL', 'events', 899.00, 'INR', 'https://picsum.photos/seed/gazebo/600',
     '{"rental_unit":"day","deposit":3500,"min_days":1,"max_days":14}'::jsonb, TRUE, now(), now())
) AS v(sku, name, description, product_type, category, base_price, currency, image_url, attributes, active, created_at, updated_at)
WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.sku = v.sku);
