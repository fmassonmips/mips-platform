-- Accounts: e-mail confirmation at sign-up and password reset.
-- Apply once on an existing database, after 017_bookora.sql:
--   mysql -u root -p mips_platform < sql/migrations/018_account_tokens.sql

-- A password change logs out the other sessions of the account.
ALTER TABLE users ADD COLUMN password_changed_at DATETIME NULL AFTER is_active;

-- ---- user_tokens (single-use links sent by e-mail) ---------------------------
-- Only the SHA-256 of the token is stored.
CREATE TABLE IF NOT EXISTS user_tokens (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id     BIGINT UNSIGNED NOT NULL,
    purpose     VARCHAR(8)      NOT NULL,                  -- verify | reset | notice
    token_hash  CHAR(64)        NOT NULL,
    created_at  DATETIME        NOT NULL,
    expires_at  DATETIME        NOT NULL,
    used_at     DATETIME        NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_user_tokens_hash (token_hash),
    KEY idx_user_tokens_user (user_id, purpose, created_at),
    CONSTRAINT fk_user_tokens_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
