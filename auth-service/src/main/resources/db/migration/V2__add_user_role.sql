-- Phase 3, Pillar 1: role-based access control.
-- Every existing and new user defaults to USER; admins are promoted at login time from the
-- app.admin-emails allowlist (see UserService.roleFor). IF NOT EXISTS keeps this idempotent.
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'USER';
