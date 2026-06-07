-- Baseline schema for auth-service.
-- Uses IF NOT EXISTS throughout so this is safe to run against both
-- a fresh database (creates everything) and the existing production database (no-ops).

CREATE TABLE IF NOT EXISTS users (
    id           VARCHAR(255) PRIMARY KEY,
    email        VARCHAR(255) NOT NULL,
    name         VARCHAR(255),
    picture      VARCHAR(255),
    display_name VARCHAR(255),
    created_at   TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_users_email ON users (email);
