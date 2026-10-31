-- =====================================================================
-- 001 — Foundation: tenancy, identity, sessions, RBAC, immutable audit
-- Runs as mips_owner. Runtime role mips_app is subject to RLS (see 900).
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Current tenant for the transaction. Set by the application with
--   SELECT set_config('app.tenant_id', $1, true)
-- inside every tenant-scoped transaction. NULL => no tenant rows visible.
CREATE OR REPLACE FUNCTION app_tenant() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_user() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

-- ---------------------------------------------------------------------
CREATE TABLE tenants (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code               text NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9-]{2,40}$'),
  name               text NOT NULL,
  legal_name         text,
  country            char(2) NOT NULL DEFAULT 'MU',
  base_currency      char(3) NOT NULL DEFAULT 'MUR',
  fiscal_year_start_month smallint NOT NULL DEFAULT 7 CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  is_demo            boolean NOT NULL DEFAULT false,
  plan               text NOT NULL DEFAULT 'enterprise',
  features           jsonb NOT NULL DEFAULT '{}'::jsonb,   -- module activation flags
  settings           jsonb NOT NULL DEFAULT '{}'::jsonb,   -- accounting & calculation policies
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              text NOT NULL,
  name               text NOT NULL,
  password_hash      text NOT NULL,
  mfa_secret         text,
  mfa_enabled        boolean NOT NULL DEFAULT false,
  is_active          boolean NOT NULL DEFAULT true,
  last_login_at      timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_users_email ON users (lower(email));
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Roles are tenant-configurable; permissions are a fixed catalogue in code
-- (src/lib/auth/permissions.ts) and assigned to roles here.
CREATE TABLE roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code        text NOT NULL,
  name        text NOT NULL,
  description text,
  is_system   boolean NOT NULL DEFAULT false,
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, id)
);

CREATE TABLE permissions (
  code        text PRIMARY KEY,
  module      text NOT NULL,
  description text NOT NULL
);

CREATE TABLE role_permissions (
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role_id         uuid NOT NULL,
  permission_code text NOT NULL REFERENCES permissions(code),
  PRIMARY KEY (role_id, permission_code),
  FOREIGN KEY (tenant_id, role_id) REFERENCES roles(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE memberships (
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id     uuid NOT NULL,
  department  text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id),
  FOREIGN KEY (tenant_id, role_id) REFERENCES roles(tenant_id, id)
);
CREATE INDEX idx_memberships_user ON memberships(user_id);

-- Sessions: the cookie carries a random token; only its SHA-256 is stored.
CREATE TABLE sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash    text NOT NULL UNIQUE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id     uuid REFERENCES tenants(id) ON DELETE CASCADE,
  mfa_verified  boolean NOT NULL DEFAULT false,
  ip            text,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE login_attempts (
  id           bigserial PRIMARY KEY,
  email        text NOT NULL,
  ip           text NOT NULL,
  success      boolean NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_login_attempts_email ON login_attempts(lower(email), attempted_at);
CREATE INDEX idx_login_attempts_ip ON login_attempts(ip, attempted_at);

-- API keys for machine access to /api/v1 (hash stored only)
CREATE TABLE api_keys (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  key_prefix  text NOT NULL,
  key_hash    text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at  timestamptz
);

-- ---------------------------------------------------------------------
-- Immutable, hash-chained audit log (per tenant).
-- ---------------------------------------------------------------------
CREATE TABLE audit_events (
  id            bigserial PRIMARY KEY,
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES users(id),
  actor_label   text,
  action        text NOT NULL,
  entity_type   text NOT NULL,
  entity_id     text,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  prev_hash     text,
  hash          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX idx_audit_tenant_entity ON audit_events(tenant_id, entity_type, entity_id);
CREATE INDEX idx_audit_tenant_time ON audit_events(tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION audit_chain() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE prev text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('audit:' || NEW.tenant_id::text));
  SELECT hash INTO prev FROM audit_events WHERE tenant_id = NEW.tenant_id ORDER BY id DESC LIMIT 1;
  NEW.prev_hash := prev;
  NEW.created_at := clock_timestamp();
  NEW.hash := encode(digest(
      coalesce(prev,'GENESIS') || '|' || NEW.tenant_id::text || '|' || coalesce(NEW.actor_user_id::text,'') || '|' ||
      NEW.action || '|' || NEW.entity_type || '|' || coalesce(NEW.entity_id,'') || '|' || NEW.payload::text || '|' ||
      to_char(NEW.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), 'sha256'), 'hex');
  RETURN NEW;
END $$;
CREATE TRIGGER trg_audit_chain BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION audit_chain();

CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_RECORD: % on % is not permitted', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'P0001';
END $$;


-- Demo reset is the ONLY path allowed to remove immutable records, and only
-- for tenants flagged is_demo. Real tenants can never be purged this way.
CREATE OR REPLACE FUNCTION demo_purge_allowed(t uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT current_setting('app.allow_demo_purge', true) = 'on'
     AND coalesce((SELECT is_demo FROM tenants WHERE id = t), false)
$$;
-- Audit log: UPDATE never allowed; DELETE only via demo purge of a demo tenant.
CREATE TRIGGER trg_audit_no_update BEFORE UPDATE ON audit_events FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER trg_audit_no_delete BEFORE DELETE ON audit_events FOR EACH ROW
  WHEN (NOT demo_purge_allowed(OLD.tenant_id)) EXECUTE FUNCTION forbid_mutation();
