-- =====================================================================
-- 003 — Accounting, budgets, receivables, payables, treasury, reconciliation
-- =====================================================================

CREATE TABLE departments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code       text NOT NULL,
  name       text NOT NULL,
  UNIQUE (tenant_id, code), UNIQUE (tenant_id, id)
);

-- Configurable chart of accounts with P&L mapping.
CREATE TABLE chart_of_accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code          text NOT NULL,
  name          text NOT NULL,
  account_type  text NOT NULL CHECK (account_type IN ('asset','liability','equity','revenue','expense')),
  -- P&L line mapping (NULL for balance-sheet accounts)
  pl_line       text CHECK (pl_line IN ('revenue','cost_of_sales','opex','d_and_a','finance_income','finance_costs','tax')),
  cost_category text,           -- payroll | cloud | payment_processing | banking | software | compliance | security | sales_marketing | admin | professional | rnd | depreciation | finance
  cost_behaviour text CHECK (cost_behaviour IN ('fixed','variable','semi')),
  revenue_stream text,          -- product code for revenue accounts
  is_cash       boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, code), UNIQUE (tenant_id, id)
);

CREATE TABLE financial_periods (
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period      date NOT NULL CHECK (extract(day from period) = 1),
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','soft_closed','locked')),
  locked_by   uuid REFERENCES users(id),
  locked_at   timestamptz,
  PRIMARY KEY (tenant_id, period)
);

CREATE TABLE gl_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  journal_ref   text NOT NULL,
  line_no       integer NOT NULL DEFAULT 1,
  entry_date    date NOT NULL,
  period        date NOT NULL,
  account_id    uuid NOT NULL,
  department_id uuid,
  product_id    uuid,
  merchant_id   uuid,
  description   text,
  currency      char(3) NOT NULL,
  debit         numeric(20,4) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit        numeric(20,4) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  fx_rate_to_base numeric(20,10) NOT NULL DEFAULT 1,
  debit_base    numeric(20,4) NOT NULL DEFAULT 0,
  credit_base   numeric(20,4) NOT NULL DEFAULT 0,
  source_system text NOT NULL DEFAULT 'manual',
  import_batch_id uuid,
  source_row_id uuid,
  is_adjustment boolean NOT NULL DEFAULT false,
  adjustment_id uuid,
  is_demo       boolean NOT NULL DEFAULT false,
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (period = date_trunc('month', entry_date)::date),
  CHECK (NOT (debit > 0 AND credit > 0)),
  UNIQUE (tenant_id, journal_ref, line_no),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, account_id) REFERENCES chart_of_accounts(tenant_id, id),
  FOREIGN KEY (tenant_id, department_id) REFERENCES departments(tenant_id, id),
  FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id),
  FOREIGN KEY (tenant_id, merchant_id) REFERENCES merchants(tenant_id, id),
  FOREIGN KEY (tenant_id, import_batch_id) REFERENCES import_batches(tenant_id, id)
);
CREATE INDEX idx_gl_period ON gl_entries(tenant_id, period, account_id);

-- Period locking: no posting/modification into a locked period; GL is append-only.
CREATE OR REPLACE FUNCTION gl_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE st text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF demo_purge_allowed(OLD.tenant_id) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'IMMUTABLE_RECORD: GL entries cannot be deleted; post a reversing journal' USING ERRCODE='P0001';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'IMMUTABLE_RECORD: GL entries cannot be modified; post an adjustment' USING ERRCODE='P0001';
  END IF;
  SELECT status INTO st FROM financial_periods WHERE tenant_id = NEW.tenant_id AND period = NEW.period;
  IF st = 'locked' THEN
    RAISE EXCEPTION 'PERIOD_LOCKED: period % is locked', NEW.period USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_gl_guard BEFORE INSERT OR UPDATE OR DELETE ON gl_entries FOR EACH ROW EXECUTE FUNCTION gl_guard();

-- Manual adjustments are explicit, approved and evidenced; never silent.
CREATE TABLE adjustments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reference    text NOT NULL,
  period       date NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('accrual','reclassification','correction','fx','other')),
  description  text NOT NULL,
  amount_base  numeric(20,4) NOT NULL,
  status       text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','rejected','posted')),
  proposed_by  uuid REFERENCES users(id),
  approved_by  uuid REFERENCES users(id),
  approved_at  timestamptz,
  evidence_ref text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (approved_by IS NULL OR approved_by IS DISTINCT FROM proposed_by),
  UNIQUE (tenant_id, reference)
);

-- ---------------------------------------------------------------------
-- Budgets & forecasts (versioned, approval-locked)
-- ---------------------------------------------------------------------
CREATE TABLE budget_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         text NOT NULL,
  fiscal_year  integer NOT NULL,          -- FY label = calendar year in which FY ends
  kind         text NOT NULL CHECK (kind IN ('budget','forecast')),
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','superseded')),
  parent_version_id uuid,
  revision     integer NOT NULL DEFAULT 1,
  notes        text,
  created_by   uuid REFERENCES users(id),
  submitted_by uuid REFERENCES users(id),
  approved_by  uuid REFERENCES users(id),
  approved_at  timestamptz,
  is_demo      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (approved_by IS NULL OR approved_by IS DISTINCT FROM submitted_by),
  UNIQUE (tenant_id, name), UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, parent_version_id) REFERENCES budget_versions(tenant_id, id)
);

CREATE TABLE budget_lines (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  version_id   uuid NOT NULL,
  account_id   uuid NOT NULL,
  department_id uuid,
  product_id   uuid,
  period       date NOT NULL CHECK (extract(day from period) = 1),
  amount_base  numeric(20,4) NOT NULL,   -- positive = income for revenue, cost for expense
  UNIQUE (version_id, account_id, department_id, product_id, period),
  FOREIGN KEY (tenant_id, version_id) REFERENCES budget_versions(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, account_id) REFERENCES chart_of_accounts(tenant_id, id),
  FOREIGN KEY (tenant_id, department_id) REFERENCES departments(tenant_id, id),
  FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id)
);
CREATE INDEX idx_budget_lines_v ON budget_lines(version_id, period);

CREATE OR REPLACE FUNCTION budget_line_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE st text; vid uuid; tid uuid;
BEGIN
  vid := CASE WHEN TG_OP = 'DELETE' THEN OLD.version_id ELSE NEW.version_id END;
  tid := CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
  IF TG_OP = 'DELETE' AND demo_purge_allowed(tid) THEN RETURN OLD; END IF;
  SELECT status INTO st FROM budget_versions WHERE id = vid;
  IF st IN ('approved','superseded') THEN
    RAISE EXCEPTION 'VERSION_LOCKED: approved budget versions are locked; create a revision' USING ERRCODE='P0001';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER trg_budget_line_guard BEFORE INSERT OR UPDATE OR DELETE ON budget_lines
  FOR EACH ROW EXECUTE FUNCTION budget_line_guard();

CREATE TABLE variance_commentary (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  version_id   uuid NOT NULL,
  period       date NOT NULL,
  line_key     text NOT NULL,          -- P&L line or account code
  comment      text NOT NULL,
  author_id    uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, version_id) REFERENCES budget_versions(tenant_id, id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- Receivables
-- ---------------------------------------------------------------------
CREATE TABLE customer_invoices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  number        text NOT NULL,
  merchant_id   uuid NOT NULL,
  issue_date    date NOT NULL,
  due_date      date NOT NULL,
  currency      char(3) NOT NULL,
  amount        numeric(20,4) NOT NULL CHECK (amount >= 0),
  amount_paid   numeric(20,4) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  fx_rate_to_base numeric(20,10) NOT NULL DEFAULT 1,
  description   text,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open','partially_paid','paid','void')),
  disputed      boolean NOT NULL DEFAULT false,
  dispute_reason text,
  collection_status text NOT NULL DEFAULT 'none' CHECK (collection_status IN ('none','reminder_due','reminded','promised','escalated','legal')),
  promise_date  date,
  paid_date     date,
  is_demo       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (amount_paid <= amount),
  CHECK (due_date >= issue_date),
  UNIQUE (tenant_id, number), UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, merchant_id) REFERENCES merchants(tenant_id, id)
);
CREATE INDEX idx_ci_due ON customer_invoices(tenant_id, status, due_date);

CREATE TABLE collection_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id   uuid NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('note','reminder_drafted','reminder_approved','reminder_sent','promise','escalation','dispute','payment')),
  note         text,
  message_draft text,
  status       text NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded','pending_approval','approved','rejected')),
  created_by   uuid REFERENCES users(id),
  approved_by  uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (approved_by IS NULL OR approved_by IS DISTINCT FROM created_by),
  FOREIGN KEY (tenant_id, invoice_id) REFERENCES customer_invoices(tenant_id, id)
);

CREATE TABLE collection_policies (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  days_overdue integer NOT NULL,
  action       text NOT NULL CHECK (action IN ('reminder','second_reminder','escalation','legal_review')),
  template     text NOT NULL,
  requires_approval boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, days_overdue)
);

-- ---------------------------------------------------------------------
-- Payables
-- ---------------------------------------------------------------------
CREATE TABLE suppliers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code          text NOT NULL,
  name          text NOT NULL,
  category      text NOT NULL,
  payment_terms_days integer NOT NULL DEFAULT 30,
  currency      char(3) NOT NULL DEFAULT 'MUR',
  bank_account_masked text,
  is_critical   boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, code), UNIQUE (tenant_id, id)
);

CREATE TABLE supplier_invoices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supplier_id   uuid NOT NULL,
  number        text NOT NULL,
  invoice_date  date NOT NULL,
  due_date      date NOT NULL,
  currency      char(3) NOT NULL,
  amount        numeric(20,4) NOT NULL CHECK (amount >= 0),
  fx_rate_to_base numeric(20,10) NOT NULL DEFAULT 1,
  description   text,
  account_id    uuid,
  status        text NOT NULL DEFAULT 'received' CHECK (status IN ('received','approved','scheduled','paid','rejected','on_hold')),
  priority      text NOT NULL DEFAULT 'normal' CHECK (priority IN ('critical','high','normal','low')),
  scheduled_date date,
  paid_date     date,
  payment_ref   text,
  submitted_by  uuid REFERENCES users(id),
  approved_by   uuid REFERENCES users(id),
  approved_at   timestamptz,
  scheduled_by  uuid REFERENCES users(id),
  is_demo       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- segregation of duties: submitter cannot approve
  CHECK (approved_by IS NULL OR approved_by IS DISTINCT FROM submitted_by),
  UNIQUE (tenant_id, supplier_id, number), UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, supplier_id) REFERENCES suppliers(tenant_id, id),
  FOREIGN KEY (tenant_id, account_id) REFERENCES chart_of_accounts(tenant_id, id)
);
CREATE INDEX idx_si_due ON supplier_invoices(tenant_id, status, due_date);

-- ---------------------------------------------------------------------
-- Treasury
-- ---------------------------------------------------------------------
CREATE TABLE bank_accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code          text NOT NULL,
  name          text NOT NULL,
  bank_name     text NOT NULL,
  currency      char(3) NOT NULL,
  -- Restricted/safeguarded/merchant funds are NEVER counted as operating cash
  account_class text NOT NULL CHECK (account_class IN ('operating','restricted','safeguarded','merchant_settlement')),
  masked_number text,
  opening_balance numeric(20,4) NOT NULL DEFAULT 0,
  opening_date  date NOT NULL,
  ledger_account_id uuid,
  is_active     boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, code), UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, ledger_account_id) REFERENCES chart_of_accounts(tenant_id, id)
);

CREATE TABLE bank_transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bank_account_id uuid NOT NULL,
  txn_date      date NOT NULL,
  value_date    date,
  amount        numeric(20,4) NOT NULL,            -- signed: + inflow, - outflow
  currency      char(3) NOT NULL,
  description   text NOT NULL,
  reference     text,
  counterparty  text,
  category      text,                              -- receipts | payroll | supplier | tax | settlement | bank_charges | acquirer_fees | loan | capex | other
  bank_ref      text NOT NULL,                     -- statement line identifier
  import_batch_id uuid,
  source_row_id uuid,
  is_demo       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, bank_account_id, bank_ref),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, bank_account_id) REFERENCES bank_accounts(tenant_id, id),
  FOREIGN KEY (tenant_id, import_batch_id) REFERENCES import_batches(tenant_id, id)
);
CREATE INDEX idx_bank_txn ON bank_transactions(tenant_id, bank_account_id, txn_date);

-- Expected cash items for reconciliation (ledger side): receipts, payments, settlements
CREATE TABLE cash_ledger_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bank_account_id uuid NOT NULL,
  item_date     date NOT NULL,
  amount        numeric(20,4) NOT NULL,     -- signed
  currency      char(3) NOT NULL,
  source_type   text NOT NULL CHECK (source_type IN ('gl','customer_receipt','supplier_payment','settlement','acquirer_fee','bank_charge','payroll','tax','other')),
  source_id     uuid,
  reference     text,
  description   text,
  is_demo       boolean NOT NULL DEFAULT false,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, bank_account_id) REFERENCES bank_accounts(tenant_id, id)
);
CREATE INDEX idx_cli ON cash_ledger_items(tenant_id, bank_account_id, item_date);

CREATE TABLE reconciliations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bank_account_id uuid NOT NULL,
  period        date NOT NULL,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','approved')),
  statement_balance numeric(20,4),
  ledger_balance numeric(20,4),
  unresolved_difference numeric(20,4),
  prepared_by   uuid REFERENCES users(id),
  approved_by   uuid REFERENCES users(id),
  approved_at   timestamptz,
  CHECK (approved_by IS NULL OR approved_by IS DISTINCT FROM prepared_by),
  UNIQUE (tenant_id, bank_account_id, period), UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, bank_account_id) REFERENCES bank_accounts(tenant_id, id)
);

CREATE TABLE recon_matches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reconciliation_id uuid NOT NULL,
  match_type    text NOT NULL CHECK (match_type IN ('auto','manual')),
  cardinality   text NOT NULL CHECK (cardinality IN ('one_to_one','one_to_many','many_to_one','many_to_many')),
  rule          text,
  bank_total    numeric(20,4) NOT NULL,
  ledger_total  numeric(20,4) NOT NULL,
  difference    numeric(20,4) NOT NULL,
  status        text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','confirmed','rejected')),
  created_by    uuid REFERENCES users(id),
  confirmed_by  uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, reconciliation_id) REFERENCES reconciliations(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE recon_match_items (
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  match_id      uuid NOT NULL,
  side          text NOT NULL CHECK (side IN ('bank','ledger')),
  item_id       uuid NOT NULL,
  amount        numeric(20,4) NOT NULL,
  PRIMARY KEY (match_id, side, item_id),
  FOREIGN KEY (tenant_id, match_id) REFERENCES recon_matches(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX idx_rmi_item ON recon_match_items(tenant_id, side, item_id);

CREATE TABLE recon_exceptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reconciliation_id uuid NOT NULL,
  side          text NOT NULL CHECK (side IN ('bank','ledger')),
  item_id       uuid NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('unmatched','duplicate','amount_difference','date_difference')),
  amount        numeric(20,4) NOT NULL,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved')),
  -- Unresolved differences are never written off automatically.
  resolution    text,
  resolved_by   uuid REFERENCES users(id),
  resolved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reconciliation_id, side, item_id, kind),
  FOREIGN KEY (tenant_id, reconciliation_id) REFERENCES reconciliations(tenant_id, id) ON DELETE CASCADE
);

-- Manual / recurring items for the 13-week cash forecast
CREATE TABLE cash_forecast_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category      text NOT NULL CHECK (category IN ('customer_receipts','merchant_obligations','payroll','supplier_payments','taxes','regulatory','loan_repayments','capex','other_in','other_out')),
  description   text NOT NULL,
  amount_base   numeric(20,4) NOT NULL,       -- signed
  recurrence    text NOT NULL DEFAULT 'once' CHECK (recurrence IN ('once','weekly','monthly')),
  start_date    date NOT NULL,
  end_date      date,
  day_of_month  smallint,
  is_demo       boolean NOT NULL DEFAULT false,
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE regulatory_requirements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code          text NOT NULL,
  description   text NOT NULL,
  minimum_amount_base numeric(20,4) NOT NULL,
  basis         text NOT NULL,     -- documented source (to be verified by compliance)
  UNIQUE (tenant_id, code)
);
