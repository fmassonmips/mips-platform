-- =====================================================================
-- 900 — Tenant isolation (Row Level Security) and runtime grants.
-- Every table carrying tenant_id is isolated by app_tenant().
-- The runtime role (mips_app) has NOBYPASSRLS. The owner role is used only
-- for migrations and platform provisioning scripts.
-- =====================================================================

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id' AND t.table_type = 'BASE TABLE'
      AND c.table_name NOT IN ('sessions')        -- user-scoped; tenant chosen after login
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', r.table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', r.table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant())', r.table_name);
    -- Defence in depth: data tables are isolated even for the owner role (seeding, scripts).
    -- Identity tables stay unforced so the narrow SECURITY DEFINER auth lookups work.
    IF r.table_name NOT IN ('memberships','roles','role_permissions','api_keys') THEN
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', r.table_name);
    END IF;
  END LOOP;
END $$;

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_self ON tenants;
CREATE POLICY tenant_self ON tenants USING (id = app_tenant());

-- Pre-tenant lookups needed by authentication, exposed as narrow SECURITY DEFINER functions.
CREATE OR REPLACE FUNCTION auth_user_memberships(p_user uuid)
RETURNS TABLE (tenant_id uuid, tenant_code text, tenant_name text, is_demo boolean, role_code text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.code, t.name, t.is_demo, r.code
  FROM memberships m JOIN tenants t ON t.id = m.tenant_id JOIN roles r ON r.id = m.role_id
  WHERE m.user_id = p_user AND m.is_active AND t.status = 'active'
  ORDER BY m.created_at, t.name   -- primary tenant = first joined
$$;

CREATE OR REPLACE FUNCTION auth_api_key_lookup(p_hash text)
RETURNS TABLE (key_id uuid, tenant_id uuid, user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, tenant_id, user_id FROM api_keys WHERE key_hash = p_hash AND revoked_at IS NULL
$$;

-- Delete protection for evidence-type tables (demo purge excepted)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['evidence_records','reports','kpi_verifications','formula_versions','calc_runs'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_nodelete ON %I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_nodelete BEFORE DELETE ON %I FOR EACH ROW WHEN (NOT demo_purge_allowed(OLD.tenant_id)) EXECUTE FUNCTION forbid_mutation()', t, t);
  END LOOP;
END $$;

-- Runtime grants
GRANT USAGE ON SCHEMA public TO mips_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mips_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mips_app;
REVOKE UPDATE ON audit_events FROM mips_app;
REVOKE INSERT, UPDATE, DELETE ON permissions, currencies FROM mips_app;
REVOKE INSERT, DELETE ON tenants FROM mips_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO mips_app;
-- Demo purge needs DELETE on audit rows for demo tenants only (trigger enforces is_demo)
GRANT DELETE ON audit_events TO mips_app;

-- Read-only backup role (created by db/bootstrap.sql with BYPASSRLS)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mips_backup') THEN
    GRANT USAGE ON SCHEMA public TO mips_backup;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO mips_backup;
    GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO mips_backup;
  END IF;
END $$;

-- =====================================================================
-- User accounts isolation.
-- users is global (one account may belong to several tenants), so it has no
-- tenant_id. The runtime role sees an account only if it is the current user
-- (app.user_id) or holds a membership in the current tenant (app.tenant_id).
-- Accounts are updated only by their owner; creation goes through
-- admin_find_or_create_user, which checks admin.users in the current tenant.
-- Pre-authentication lookups use narrow SECURITY DEFINER functions.
-- Not FORCEd: the owner role provisions accounts (seed, platform scripts).
-- =====================================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_visible ON users;
DROP POLICY IF EXISTS users_self_update ON users;
CREATE POLICY users_visible ON users FOR SELECT USING (
  id = app_user()
  OR EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = users.id AND m.tenant_id = app_tenant())
);
CREATE POLICY users_self_update ON users FOR UPDATE USING (id = app_user()) WITH CHECK (id = app_user());
REVOKE INSERT, DELETE ON users FROM mips_app;

-- Login: credentials lookup by email, before any tenant or user context exists.
CREATE OR REPLACE FUNCTION auth_user_by_email(p_email text)
RETURNS TABLE (id uuid, password_hash text, is_active boolean, mfa_enabled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.password_hash, u.is_active, u.mfa_enabled FROM users u WHERE lower(u.email) = lower(p_email)
$$;

-- Tenant administrators add an account by email. Returns the existing account
-- (possibly a member of other tenants) or creates it. Refuses callers without
-- admin.users in the current tenant.
CREATE OR REPLACE FUNCTION admin_find_or_create_user(p_email text, p_name text, p_password_hash text)
RETURNS TABLE (user_id uuid, created boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF app_tenant() IS NULL OR app_user() IS NULL OR NOT EXISTS (
    SELECT 1 FROM memberships m JOIN role_permissions rp ON rp.role_id = m.role_id AND rp.tenant_id = m.tenant_id
    WHERE m.user_id = app_user() AND m.tenant_id = app_tenant() AND m.is_active AND rp.permission_code = 'admin.users'
  ) THEN
    RAISE EXCEPTION 'admin.users permission required in the current tenant' USING ERRCODE = '42501';
  END IF;
  SELECT u.id INTO v_id FROM users u WHERE lower(u.email) = lower(p_email);
  IF v_id IS NOT NULL THEN RETURN QUERY SELECT v_id, false; RETURN; END IF;
  INSERT INTO users (email, name, password_hash) VALUES (lower(p_email), p_name, p_password_hash) RETURNING id INTO v_id;
  RETURN QUERY SELECT v_id, true;
END $$;

REVOKE ALL ON FUNCTION auth_user_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_find_or_create_user(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_user_by_email(text), admin_find_or_create_user(text, text, text) TO mips_app;
