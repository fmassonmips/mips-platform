-- Supervision: last run of each scheduled job (tools/cron.sh) and the problems
-- the watchdog has already e-mailed about (tools/ops.php watchdog).
-- Apply once on an existing database, after 026_digest.sql:
--   mysql -u root -p mips_platform < sql/migrations/027_ops.sql

CREATE TABLE IF NOT EXISTS ops_jobs (
    job         VARCHAR(40) NOT NULL,              -- mra_retry, reminders, backup… (App\Ops\Health::JOBS)
    last_run_at DATETIME    NOT NULL,
    last_exit   SMALLINT    NOT NULL,              -- 0 = success
    last_ok_at  DATETIME    NULL,
    PRIMARY KEY (job)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ops_alerts (
    problem     VARCHAR(80) NOT NULL,              -- e.g. job:backup:stale, disk
    since       DATETIME    NOT NULL,
    notified_at DATETIME    NULL,                  -- NULL: the e-mail has not gone out yet
    PRIMARY KEY (problem)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
