-- Fruit-quiz demand capture (Phase 0 go-live). The storefront's "Find your MaLLADE match" quiz lets a
-- visitor pick the fruits they crave; the backend fans those out to one notify_signups row per fruit
-- (topic = fruit slug), so per-fruit demand stays a free `GROUP BY topic` aggregate over the existing
-- (topic, phone) unique index. Two additive, NULLABLE columns carry the richer lead:
--   name   — the visitor's name (the quiz asks for it; the older honey teaser did not, hence nullable).
--   source — which surface captured the lead ('quiz' | 'teaser'), so the Demand dashboard can split channels.
-- topic stays VARCHAR(32): fruit slugs are short ('litchi','mango','honey') and the DTO bounds them to 32,
-- so a value can never outrun the column (avoids the VARCHAR-too-small startup crash class).
-- Idempotent DDL (IF NOT EXISTS), consistent with the rest of the migration set.

ALTER TABLE notify_signups
    ADD COLUMN IF NOT EXISTS name   VARCHAR(128),
    ADD COLUMN IF NOT EXISTS source VARCHAR(32);
