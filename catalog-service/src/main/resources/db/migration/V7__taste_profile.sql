-- Taste Match V7 persistence (the ?taste-match game's go-live, account-side mirror).
-- One row per logged-in account, keyed by the auth user id. The storefront keeps its localStorage
-- progression as the offline/guest source of truth; this table is the account-side mirror so a player's
-- XP / passport / badges / streak / persona + demand-footprint (state, pincode) survive across devices
-- and a re-install once they sign in. On login the device snapshot is MERGED in (union of collectibles,
-- max of XP/streak) so nothing earned as a guest is lost — mirroring the guest-cart carry-over invariant.
--
-- user_id is VARCHAR(255) to MATCH the auth users.id type exactly: a Google "sub", a self-registered
-- "usr-<uuid>", or a "guest-<uuid>" all fit (guests never reach an authenticated write, but the column
-- type is sized for the longest realistic id either way). It is NOT a FK — auth-service owns the users
-- table in a SEPARATE database (database-per-service), so this is a logical, not a referential, key.
--
-- VARCHARs are sized generously (or use TEXT) so a value can never outrun its column at startup — the
-- VARCHAR-too-small-vs-its-own-DEFAULT crash class is avoided. JSON-shaped collections use jsonb to
-- match the catalog's existing convention (products.attributes is jsonb via @JdbcTypeCode(SqlTypes.JSON)).
-- Idempotent DDL (IF NOT EXISTS), consistent with the rest of the migration set.

CREATE TABLE IF NOT EXISTS taste_profile (
    -- the authenticated principal id (auth users.id); PK so the row is a natural upsert target.
    user_id          VARCHAR(255) PRIMARY KEY,

    -- accumulated experience points (never negative; merge takes the max so a stale device can't lower it).
    xp               INTEGER       NOT NULL DEFAULT 0,

    -- tier id (e.g. 'gourmand'); short slug, TEXT keeps it crash-proof regardless of how tiers grow.
    tier             TEXT,

    -- optional leaderboard rank (server-computed; the storefront treats it as a number). Nullable: no
    -- rank until the leaderboard exists.
    rank             INTEGER,

    -- collectible fruit slugs the account has WANT-IT'd; jsonb array, e.g. ["litchi","mango"].
    discovered_fruits jsonb        NOT NULL DEFAULT '[]'::jsonb,

    -- unlocked badge ids; jsonb array.
    badges            jsonb        NOT NULL DEFAULT '[]'::jsonb,

    -- current consecutive-day streak (server-truth; merge takes the max).
    streak            INTEGER       NOT NULL DEFAULT 0,

    -- per-fruit affinity map (slug -> weight); jsonb object, latest-wins on merge.
    fruit_affinity    jsonb        NOT NULL DEFAULT '{}'::jsonb,

    -- last persona id; short slug, TEXT to be crash-proof.
    persona           TEXT,

    -- demand-footprint: Indian state/UT. VARCHAR(128) comfortably covers the longest state/UT name
    -- (same sizing notify_signups.state uses).
    state             VARCHAR(128),

    -- demand-footprint: 6-digit Indian pincode (fixed width).
    pincode           VARCHAR(6),

    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);
