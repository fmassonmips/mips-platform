-- Closing a company: export of its data, deletion 30 days after the owner's request.
-- Apply once on an existing database, after 022_reminders.sql:
--   mysql -u root -p mips_platform < sql/migrations/023_closure.sql

-- Deletion requested by the owner: apps and public pages closed at once, members
-- logged out, the owner can still log in to export or cancel until this date.
ALTER TABLE organizations ADD COLUMN deletion_scheduled_at DATETIME NULL AFTER facturo_reminders_since;
