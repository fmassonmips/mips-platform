-- =====================================================================
-- 004 — KPI registry, formula versions, calculation runs, proof/evidence,
--        scenarios, decisions, strategy execution, reports, AI log
-- =====================================================================

CREATE TABLE kpi_definitions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code          text NOT NULL,                 -- e.g. FIN.REVENUE
  name          text NOT NULL,
  category      text NOT NULL,                 -- financial | payments | operations
  definition    text NOT NULL,
  unit          text NOT NULL CHECK (unit IN ('money','percent','count','ratio','days','bps','months')),
  direction     text NOT NULL DEFAULT 'up' CHECK (direction IN ('up','down','neutral')),
  owner         text NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  materiality_pct numeric(10,4) NOT NULL DEFAULT 5,
  UNIQUE (tenant_id, code), UNIQUE (tenant_id, id)
);

CREATE TABLE formula_versions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kpi_id        uuid NOT NULL,
  version       integer NOT NULL,
  formula       text NOT NULL,
  numerator     text,
  denominator   text,
  data_source   text NOT NULL,
  grain         text NOT NULL,
  period_basis  text NOT NULL,            -- accounting_date | settlement_date | ...
  currency_rule text NOT NULL,
  rounding      text NOT NULL,
  validation_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  engine_ref    text NOT NULL,            -- implementation key in src/lib/engine/kpis.ts
  formula_hash  text NOT NULL,
  effective_from date NOT NULL,
  approved_by   uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kpi_id, version), UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, kpi_id) REFERENCES kpi_definitions(tenant_id, id)
);
CREATE TRIGGER trg_formula_versions_immutable BEFORE UPDATE ON formula_versions FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TABLE calc_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  engine_version text NOT NULL,
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  triggered_by  uuid REFERENCES users(id),
  trigger_reason text NOT NULL,
  status        text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  checks        jsonb NOT NULL DEFAULT '[]'::jsonb,
  input_fingerprint text,
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  UNIQUE (tenant_id, id)
);

CREATE TABLE kpi_results (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  calc_run_id   uuid NOT NULL,
  kpi_id        uuid NOT NULL,
  formula_version_id uuid NOT NULL,
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  dimension     text NOT NULL DEFAULT 'total',     -- e.g. 'total' or 'merchant:M001'
  value         numeric(28,8),                      -- NULL when not computable (e.g. zero denominator)
  currency      char(3),
  inputs        jsonb NOT NULL DEFAULT '{}'::jsonb, -- numerator/denominator & component values (decimal strings)
  input_hash    text NOT NULL,
  status_note   text,
  confidence    text NOT NULL DEFAULT 'PENDING' CHECK (confidence IN ('VERIFIED','PENDING','DISPUTED','ESTIMATED')),
  is_current    boolean NOT NULL DEFAULT true,
  computed_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, calc_run_id) REFERENCES calc_runs(tenant_id, id),
  FOREIGN KEY (tenant_id, kpi_id) REFERENCES kpi_definitions(tenant_id, id),
  FOREIGN KEY (tenant_id, formula_version_id) REFERENCES formula_versions(tenant_id, id)
);
CREATE INDEX idx_kpi_results_lookup ON kpi_results(tenant_id, kpi_id, period_start, dimension) WHERE is_current;
-- KPI result values are immutable; only is_current/confidence may progress.
CREATE OR REPLACE FUNCTION protect_kpi_result() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF demo_purge_allowed(OLD.tenant_id) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'IMMUTABLE_RECORD: KPI results are preserved for audit' USING ERRCODE='P0001';
  END IF;
  IF (NEW.value, NEW.inputs, NEW.input_hash, NEW.formula_version_id, NEW.period_start, NEW.period_end, NEW.dimension)
     IS DISTINCT FROM (OLD.value, OLD.inputs, OLD.input_hash, OLD.formula_version_id, OLD.period_start, OLD.period_end, OLD.dimension) THEN
    RAISE EXCEPTION 'IMMUTABLE_RECORD: KPI result values cannot be modified; recalculate instead' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_kpi_results_protect BEFORE UPDATE OR DELETE ON kpi_results FOR EACH ROW EXECUTE FUNCTION protect_kpi_result();

-- Management verification of a KPI for a period (NOT an external audit opinion)
CREATE TABLE kpi_verifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kpi_id        uuid NOT NULL,
  period_start  date NOT NULL,
  kpi_result_id uuid,
  status        text NOT NULL CHECK (status IN ('VERIFIED','PENDING','DISPUTED','ESTIMATED')),
  basis         text NOT NULL,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  verified_by   uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, kpi_id) REFERENCES kpi_definitions(tenant_id, id),
  FOREIGN KEY (tenant_id, kpi_result_id) REFERENCES kpi_results(tenant_id, id)
);
CREATE TRIGGER trg_kpi_verif_immutable BEFORE UPDATE ON kpi_verifications FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TABLE evidence_records (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subject_type  text NOT NULL,       -- kpi_result | decision | reconciliation | report | adjustment
  subject_id    text NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('source_file','import_batch','reconciliation','approval','adjustment','pricing_agreement','fee_schedule','calculation','note','report','external_document')),
  reference     text NOT NULL,
  description   text,
  sha256        text,
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_evidence_subject ON evidence_records(tenant_id, subject_type, subject_id);
CREATE TRIGGER trg_evidence_immutable BEFORE UPDATE ON evidence_records FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- ---------------------------------------------------------------------
-- CEO Decision Center
-- ---------------------------------------------------------------------
CREATE TABLE scenarios (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code          text NOT NULL,
  name          text NOT NULL,
  template      text NOT NULL,       -- engine template key (see src/lib/engine/scenarios.ts)
  description   text,
  assumptions   jsonb NOT NULL,      -- validated inputs (decimal strings)
  results       jsonb,               -- computed output: base / proposed / downside
  engine_version text,
  base_period_start date NOT NULL,
  base_period_end date NOT NULL,
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','shortlisted','selected','rejected','archived')),
  comparison_group text,
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code), UNIQUE (tenant_id, id)
);

CREATE TABLE executive_decisions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code          text NOT NULL,             -- DEC-2026-001
  title         text NOT NULL,
  description   text NOT NULL,
  rationale     text NOT NULL,
  scenario_id   uuid,
  evidence      jsonb NOT NULL DEFAULT '[]'::jsonb,
  owner_user_id uuid REFERENCES users(id),
  approver_user_id uuid REFERENCES users(id),
  proposed_by   uuid REFERENCES users(id),
  approved_at   timestamptz,
  expected_impact jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {monthly_contribution_delta, monthly_revenue_delta, ...}
  measurement   jsonb NOT NULL DEFAULT '{}'::jsonb,    -- {metric, scope, baseline_start, baseline_end}
  implementation_deadline date,
  status        text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','rejected','in_progress','implemented','closed','cancelled')),
  actual_outcome jsonb,
  outcome_measured_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (approver_user_id IS NULL OR approved_at IS NULL OR approver_user_id IS DISTINCT FROM proposed_by),
  UNIQUE (tenant_id, code), UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, scenario_id) REFERENCES scenarios(tenant_id, id)
);

-- ---------------------------------------------------------------------
-- Strategy execution
-- ---------------------------------------------------------------------
CREATE TABLE strategic_objectives (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code          text NOT NULL,
  title         text NOT NULL,
  description   text,
  theme         text NOT NULL,        -- merchant_acquisition | onboarding_automation | platform_stability | merchant_experience | acceptance_expansion | revenue_diversification | profitability
  fiscal_year   integer NOT NULL,
  owner_user_id uuid REFERENCES users(id),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','achieved','missed','dropped')),
  UNIQUE (tenant_id, code), UNIQUE (tenant_id, id)
);

CREATE TABLE key_results (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  objective_id  uuid NOT NULL,
  title         text NOT NULL,
  kpi_code      text,                 -- links to kpi_definitions.code for automatic measurement
  quarter       text NOT NULL,        -- 2026-Q4
  baseline      numeric(28,8),
  target        numeric(28,8) NOT NULL,
  current_value numeric(28,8),
  unit          text NOT NULL,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, objective_id) REFERENCES strategic_objectives(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE initiatives (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code          text NOT NULL,
  objective_id  uuid,
  decision_id   uuid,
  title         text NOT NULL,
  description   text,
  owner_user_id uuid REFERENCES users(id),
  department    text,
  budget_base   numeric(20,4) NOT NULL DEFAULT 0,
  spent_base    numeric(20,4) NOT NULL DEFAULT 0,
  target        text,
  kpi_code      text,
  deadline      date,
  status        text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','on_track','at_risk','blocked','done','cancelled')),
  progress_pct  smallint NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  blockers      text,
  next_action   text,
  expected_impact text,
  depends_on    uuid[] NOT NULL DEFAULT '{}',
  risk_level    text NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low','medium','high')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code), UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, objective_id) REFERENCES strategic_objectives(tenant_id, id),
  FOREIGN KEY (tenant_id, decision_id) REFERENCES executive_decisions(tenant_id, id)
);

CREATE TABLE initiative_updates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  initiative_id uuid NOT NULL,
  status        text NOT NULL,
  progress_pct  smallint NOT NULL,
  note          text NOT NULL,
  author_id     uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, initiative_id) REFERENCES initiatives(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE action_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code          text NOT NULL,
  title         text NOT NULL,
  source_type   text NOT NULL CHECK (source_type IN ('decision','initiative','war_room','briefing','reconciliation','other')),
  source_id     uuid,
  owner_user_id uuid REFERENCES users(id),
  due_date      date,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','done','cancelled')),
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  UNIQUE (tenant_id, code)
);

CREATE TABLE reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind          text NOT NULL,      -- monthly_management | quarterly_board | annual_summary | budget_performance | merchant_profitability | liquidity | strategy_execution | risk_summary | ceo_briefing | decision_outcome
  title         text NOT NULL,
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  content       jsonb NOT NULL,     -- frozen report content (sections) used for all export formats
  content_sha256 text NOT NULL,
  data_status   text NOT NULL,      -- overall confidence summary
  generated_by  uuid REFERENCES users(id),
  generated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);
CREATE TRIGGER trg_reports_immutable BEFORE UPDATE ON reports FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TABLE ai_analyst_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES users(id),
  provider      text NOT NULL,
  question      text NOT NULL,
  fact_ids      jsonb NOT NULL DEFAULT '[]'::jsonb,
  response      jsonb NOT NULL,
  grounding_check jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
