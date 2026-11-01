-- =====================================================================
-- 002 — Reference data, merchants, pricing, fee schedules, transactions
-- All monetary columns: numeric(20,4). Rates in basis points: numeric(10,4).
-- FX rates: numeric(20,10). Never floating point.
-- =====================================================================

CREATE TABLE currencies (
  code      char(3) PRIMARY KEY,
  name      text NOT NULL,
  minor_units smallint NOT NULL DEFAULT 2
);

CREATE TABLE exchange_rates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rate_date   date NOT NULL,
  from_ccy    char(3) NOT NULL REFERENCES currencies(code),
  to_ccy      char(3) NOT NULL REFERENCES currencies(code),
  rate        numeric(20,10) NOT NULL CHECK (rate > 0),
  source      text NOT NULL,           -- e.g. 'BoM indicative mid', 'DEMO'
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, rate_date, from_ccy, to_ccy)
);

CREATE TABLE import_batches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind          text NOT NULL,          -- transactions | gl_entries | bank_transactions | merchants | fee_schedules | budget_lines | settlements | customer_invoices | supplier_invoices
  source_system text NOT NULL DEFAULT 'file_upload',
  filename      text NOT NULL,
  file_sha256   text NOT NULL,
  file_size     bigint NOT NULL,
  mime_type     text,
  status        text NOT NULL DEFAULT 'uploaded'
                CHECK (status IN ('uploaded','validated','approved','committed','rejected','failed')),
  detected_columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  column_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation    jsonb NOT NULL DEFAULT '{}'::jsonb,   -- summary: rows, errors, duplicates
  row_count     integer NOT NULL DEFAULT 0,
  valid_count   integer NOT NULL DEFAULT 0,
  error_count   integer NOT NULL DEFAULT 0,
  duplicate_count integer NOT NULL DEFAULT 0,
  committed_count integer NOT NULL DEFAULT 0,
  uploaded_by   uuid REFERENCES users(id),
  approved_by   uuid REFERENCES users(id),
  approved_at   timestamptz,
  committed_at  timestamptz,
  is_demo       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, kind, file_sha256),            -- idempotency: same file cannot be imported twice
  UNIQUE (tenant_id, id)
);

-- Original file bytes, tenant-isolated (file storage under RLS).
CREATE TABLE source_files (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  batch_id    uuid NOT NULL,
  sha256      text NOT NULL,
  filename    text NOT NULL,
  content     bytea NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, batch_id) REFERENCES import_batches(tenant_id, id) ON DELETE CASCADE
);

-- Each parsed source row, preserved verbatim. Immutable after insert.
CREATE TABLE import_source_rows (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  batch_id    uuid NOT NULL,
  row_number  integer NOT NULL,
  raw         jsonb NOT NULL,
  row_hash    text NOT NULL,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','valid','error','duplicate','committed','skipped')),
  errors      jsonb NOT NULL DEFAULT '[]'::jsonb,
  target_id   uuid,
  UNIQUE (batch_id, row_number),
  FOREIGN KEY (tenant_id, batch_id) REFERENCES import_batches(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX idx_source_rows_batch ON import_source_rows(batch_id, status);
CREATE INDEX idx_source_rows_target ON import_source_rows(target_id);
-- Raw source data may never be altered (status/target_id may progress).
CREATE OR REPLACE FUNCTION protect_source_row() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'IMMUTABLE_RECORD: source rows cannot be deleted' USING ERRCODE='P0001';
  END IF;
  IF NEW.raw IS DISTINCT FROM OLD.raw OR NEW.row_hash IS DISTINCT FROM OLD.row_hash
     OR NEW.row_number IS DISTINCT FROM OLD.row_number OR NEW.batch_id IS DISTINCT FROM OLD.batch_id THEN
    RAISE EXCEPTION 'IMMUTABLE_RECORD: source row content cannot be modified' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_source_rows_protect BEFORE UPDATE OR DELETE ON import_source_rows
  FOR EACH ROW WHEN (NOT demo_purge_allowed(OLD.tenant_id))
  EXECUTE FUNCTION protect_source_row();

CREATE OR REPLACE FUNCTION protect_source_file() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'IMMUTABLE_RECORD: source files cannot be modified' USING ERRCODE='P0001'; END $$;
CREATE TRIGGER trg_source_files_protect BEFORE UPDATE OR DELETE ON source_files
  FOR EACH ROW WHEN (NOT demo_purge_allowed(OLD.tenant_id))
  EXECUTE FUNCTION protect_source_file();

-- ---------------------------------------------------------------------
CREATE TABLE acquirers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code       text NOT NULL,
  name       text NOT NULL,
  country    char(2),
  is_active  boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, code), UNIQUE (tenant_id, id)
);

CREATE TABLE payment_methods (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code       text NOT NULL,
  name       text NOT NULL,
  category   text NOT NULL CHECK (category IN ('card','qr','wallet','bank_transfer','other')),
  scheme     text,               -- visa | mastercard | amex | maucas | ...
  is_active  boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, code), UNIQUE (tenant_id, id)
);

CREATE TABLE products (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code       text NOT NULL,
  name       text NOT NULL,
  channel    text NOT NULL DEFAULT 'other',  -- ecommerce | pos | softpos | qr | links | payouts | saas | orchestration
  is_transactional boolean NOT NULL DEFAULT true,
  is_active  boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, code), UNIQUE (tenant_id, id)
);

CREATE TABLE verticals (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code       text NOT NULL,
  name       text NOT NULL,
  UNIQUE (tenant_id, code), UNIQUE (tenant_id, id)
);

CREATE TABLE merchant_groups (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code       text NOT NULL,
  name       text NOT NULL,
  UNIQUE (tenant_id, code), UNIQUE (tenant_id, id)
);

CREATE TABLE merchants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code          text NOT NULL,
  name          text NOT NULL,
  group_id      uuid,
  vertical_id   uuid,
  country       char(2) NOT NULL DEFAULT 'MU',
  segment       text NOT NULL DEFAULT 'sme' CHECK (segment IN ('enterprise','mid_market','sme','micro')),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('onboarding','active','suspended','churned')),
  onboarding_started_at date,
  activated_at  date,
  churned_at    date,
  commercial_importance smallint NOT NULL DEFAULT 3 CHECK (commercial_importance BETWEEN 1 AND 5),
  churn_risk    smallint NOT NULL DEFAULT 2 CHECK (churn_risk BETWEEN 1 AND 5),
  growth_potential smallint NOT NULL DEFAULT 3 CHECK (growth_potential BETWEEN 1 AND 5),
  contract_end_date date,
  contract_notes text,          -- commercial constraints (e.g. MFN, price lock)
  price_locked_until date,      -- contractual constraint used by pricing recommendations
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code), UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, group_id) REFERENCES merchant_groups(tenant_id, id),
  FOREIGN KEY (tenant_id, vertical_id) REFERENCES verticals(tenant_id, id)
);

-- Effective-dated merchant pricing (MDR charged by MIPS to the merchant)
CREATE TABLE pricing_agreements (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  merchant_id      uuid NOT NULL,
  payment_method_id uuid,                     -- NULL = all methods
  card_region      text NOT NULL DEFAULT 'any' CHECK (card_region IN ('domestic','international','any')),
  mdr_bps          numeric(10,4) NOT NULL CHECK (mdr_bps >= 0),   -- 175 = 1.75 %
  fixed_fee        numeric(20,4) NOT NULL DEFAULT 0,
  fee_currency     char(3) NOT NULL DEFAULT 'MUR',
  monthly_saas_fee numeric(20,4) NOT NULL DEFAULT 0,
  effective_from   date NOT NULL,
  effective_to     date,                       -- inclusive; NULL = open-ended
  contract_ref     text,
  approved_by      uuid REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, merchant_id) REFERENCES merchants(tenant_id, id),
  FOREIGN KEY (tenant_id, payment_method_id) REFERENCES payment_methods(tenant_id, id)
);
CREATE INDEX idx_pricing_lookup ON pricing_agreements(tenant_id, merchant_id, effective_from);

-- Effective-dated acquirer wholesale fees (cost to MIPS)
CREATE TABLE fee_schedules (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  acquirer_id      uuid NOT NULL,
  payment_method_id uuid,
  card_region      text NOT NULL DEFAULT 'any' CHECK (card_region IN ('domestic','international','any')),
  wholesale_bps    numeric(10,4) NOT NULL CHECK (wholesale_bps >= 0),
  fixed_fee        numeric(20,4) NOT NULL DEFAULT 0,
  fee_currency     char(3) NOT NULL DEFAULT 'MUR',
  effective_from   date NOT NULL,
  effective_to     date,
  schedule_ref     text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, acquirer_id) REFERENCES acquirers(tenant_id, id),
  FOREIGN KEY (tenant_id, payment_method_id) REFERENCES payment_methods(tenant_id, id)
);
CREATE INDEX idx_fee_lookup ON fee_schedules(tenant_id, acquirer_id, effective_from);

-- Per-transaction direct processing cost model (gateway/infra cost attributable per txn)
CREATE TABLE processing_cost_rates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id       uuid,
  cost_per_txn     numeric(20,4) NOT NULL DEFAULT 0,
  cost_bps         numeric(10,4) NOT NULL DEFAULT 0,
  currency         char(3) NOT NULL DEFAULT 'MUR',
  effective_from   date NOT NULL,
  effective_to     date,
  basis            text NOT NULL,            -- documented derivation of the rate
  FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id)
);

-- Transactions processed on behalf of merchants.
-- amount = gross payment value (NOT MIPS revenue).
CREATE TABLE transactions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  external_ref       text NOT NULL,
  merchant_id        uuid NOT NULL,
  product_id         uuid NOT NULL,
  acquirer_id        uuid,
  payment_method_id  uuid NOT NULL,
  card_scheme        text,
  card_region        text NOT NULL DEFAULT 'domestic' CHECK (card_region IN ('domestic','international','na')),
  country            char(2) NOT NULL DEFAULT 'MU',
  status             text NOT NULL CHECK (status IN ('success','failed','refunded','reversed')),
  txn_currency       char(3) NOT NULL,
  settlement_currency char(3) NOT NULL,
  amount             numeric(20,4) NOT NULL CHECK (amount >= 0),      -- in txn_currency
  fx_rate_to_base    numeric(20,10) NOT NULL DEFAULT 1,               -- txn_currency -> tenant base
  amount_base        numeric(20,4) NOT NULL,                          -- gross payment value in base ccy
  mdr_fee_base       numeric(20,4) NOT NULL DEFAULT 0,                -- gross acquiring fee charged to merchant
  wholesale_fee_base numeric(20,4) NOT NULL DEFAULT 0,                -- acquirer wholesale cost
  processing_cost_base numeric(20,4) NOT NULL DEFAULT 0,              -- direct processing cost
  pricing_agreement_id uuid,
  fee_schedule_id    uuid,
  event_at           timestamptz NOT NULL,     -- authorisation time
  processed_at       timestamptz,              -- capture/clearing time
  settlement_date    date,
  accounting_date    date NOT NULL,            -- date used for P&L recognition
  import_batch_id    uuid,
  source_row_id      uuid,
  is_demo            boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_ref),          -- duplicate protection / idempotency
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, merchant_id) REFERENCES merchants(tenant_id, id),
  FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id),
  FOREIGN KEY (tenant_id, acquirer_id) REFERENCES acquirers(tenant_id, id),
  FOREIGN KEY (tenant_id, payment_method_id) REFERENCES payment_methods(tenant_id, id),
  FOREIGN KEY (tenant_id, pricing_agreement_id) REFERENCES pricing_agreements(tenant_id, id),
  FOREIGN KEY (tenant_id, fee_schedule_id) REFERENCES fee_schedules(tenant_id, id),
  FOREIGN KEY (tenant_id, import_batch_id) REFERENCES import_batches(tenant_id, id)
);
CREATE INDEX idx_txn_tenant_acctdate ON transactions(tenant_id, accounting_date);
CREATE INDEX idx_txn_tenant_merchant_date ON transactions(tenant_id, merchant_id, accounting_date);
CREATE INDEX idx_txn_batch ON transactions(import_batch_id);

-- Historical transactions are never silently overwritten: amounts/fees are frozen.
CREATE OR REPLACE FUNCTION protect_transaction() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'IMMUTABLE_RECORD: transactions cannot be deleted; post a reversal' USING ERRCODE='P0001';
  END IF;
  IF (NEW.amount, NEW.amount_base, NEW.mdr_fee_base, NEW.wholesale_fee_base, NEW.processing_cost_base,
      NEW.accounting_date, NEW.merchant_id, NEW.external_ref)
     IS DISTINCT FROM
     (OLD.amount, OLD.amount_base, OLD.mdr_fee_base, OLD.wholesale_fee_base, OLD.processing_cost_base,
      OLD.accounting_date, OLD.merchant_id, OLD.external_ref) THEN
    RAISE EXCEPTION 'IMMUTABLE_RECORD: transaction financial fields cannot be modified' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_txn_protect BEFORE UPDATE OR DELETE ON transactions
  FOR EACH ROW WHEN (NOT demo_purge_allowed(OLD.tenant_id))
  EXECUTE FUNCTION protect_transaction();

CREATE TABLE settlements (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reference        text NOT NULL,
  merchant_id      uuid NOT NULL,
  acquirer_id      uuid,
  settlement_date  date NOT NULL,
  currency         char(3) NOT NULL,
  gross_amount     numeric(20,4) NOT NULL,
  fee_amount       numeric(20,4) NOT NULL,
  net_amount       numeric(20,4) NOT NULL,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','held')),
  import_batch_id  uuid,
  is_demo          boolean NOT NULL DEFAULT false,
  UNIQUE (tenant_id, reference),
  UNIQUE (tenant_id, id),
  CHECK (net_amount = gross_amount - fee_amount),
  FOREIGN KEY (tenant_id, merchant_id) REFERENCES merchants(tenant_id, id),
  FOREIGN KEY (tenant_id, acquirer_id) REFERENCES acquirers(tenant_id, id)
);
CREATE INDEX idx_settlements_date ON settlements(tenant_id, settlement_date);

-- Operational data
CREATE TABLE onboarding_cases (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  merchant_id  uuid,
  applicant    text NOT NULL,
  opened_at    date NOT NULL,
  closed_at    date,
  status       text NOT NULL CHECK (status IN ('open','kyc_review','approved','rejected','activated')),
  is_demo      boolean NOT NULL DEFAULT false,
  FOREIGN KEY (tenant_id, merchant_id) REFERENCES merchants(tenant_id, id)
);

CREATE TABLE support_incidents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  merchant_id  uuid,
  opened_at    timestamptz NOT NULL,
  resolved_at  timestamptz,
  severity     text NOT NULL CHECK (severity IN ('sev1','sev2','sev3','sev4')),
  category     text NOT NULL,
  title        text NOT NULL,
  is_demo      boolean NOT NULL DEFAULT false,
  FOREIGN KEY (tenant_id, merchant_id) REFERENCES merchants(tenant_id, id)
);

CREATE TABLE platform_uptime (
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  day          date NOT NULL,
  service      text NOT NULL DEFAULT 'gateway',
  uptime_pct   numeric(7,4) NOT NULL CHECK (uptime_pct BETWEEN 0 AND 100),
  is_demo      boolean NOT NULL DEFAULT false,
  PRIMARY KEY (tenant_id, day, service)
);
