-- Which migrations a database has received, so tools/update.sh applies each one once.
-- Apply once on an existing database, after 030_checkout_key.sql:
--   mysql -u root -p mips_platform < sql/migrations/031_schema_migrations.sql
-- (tools/update.sh --baseline creates it and records 001 → 031 for a database that is up to date.)

CREATE TABLE IF NOT EXISTS schema_migrations (
    version    VARCHAR(80) NOT NULL,                -- file name in sql/migrations
    applied_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
