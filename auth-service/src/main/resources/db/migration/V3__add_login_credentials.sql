-- Add "our own login" credentials to the users table so customers can sign in without Google.
-- Two new login methods build on these columns: (A) email/phone + password, (B) phone + OTP.
-- All changes are additive and non-destructive — existing Google rows (phone/password_hash NULL,
-- email present) keep working. auth-service runs ddl-auto: validate, so User.java @Column must
-- match these columns exactly or the service crash-loops at boot.

-- Phone number (E.164-ish, e.g. +919876543210). NULL for Google/email-only users.
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

-- Unique phone, but only among rows that actually have one — a PARTIAL unique index so the many
-- existing Google rows with NULL phone don't collide (a plain UNIQUE would reject >1 NULL on some
-- engines; Postgres tolerates it, but the partial index states the intent precisely and cheaply).
CREATE UNIQUE INDEX IF NOT EXISTS uk_users_phone ON users(phone) WHERE phone IS NOT NULL;

-- BCrypt hash of the password. NULL for Google/OTP-only users (they have no password). 60 chars is
-- the BCrypt output width; VARCHAR(100) leaves headroom without being reversible-storage-shaped.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(100);

-- A phone-OTP-only user may have no email at all, so email can no longer be mandatory. The existing
-- unique index on email still holds; Postgres allows multiple NULLs under a unique index.
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
