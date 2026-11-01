-- =====================================================================
-- 005 — Demo reset. The ONLY way immutable records can be removed, and only
-- for a tenant flagged is_demo, only by a caller bound to that tenant.
-- =====================================================================
CREATE OR REPLACE FUNCTION demo_purge_allowed(t uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT current_setting('app.allow_demo_purge', true) = 'on'
     AND coalesce((SELECT is_demo FROM tenants WHERE id = t), false)
$$;

CREATE OR REPLACE FUNCTION purge_demo_tenant_data(t uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tbl text;
BEGIN
  IF app_tenant() IS DISTINCT FROM t THEN
    RAISE EXCEPTION 'DEMO_PURGE_DENIED: caller is not bound to tenant %', t USING ERRCODE = 'P0001';
  END IF;
  IF NOT coalesce((SELECT is_demo FROM tenants WHERE id = t), false) THEN
    RAISE EXCEPTION 'DEMO_PURGE_DENIED: tenant % is not a demo tenant', t USING ERRCODE = 'P0001';
  END IF;
  PERFORM set_config('app.allow_demo_purge', 'on', true);
  FOREACH tbl IN ARRAY ARRAY[
    'kpi_verifications','kpi_results','calc_runs','formula_versions','kpi_definitions','evidence_records','ai_analyst_log','reports',
    'action_items','initiative_updates','initiatives','key_results','strategic_objectives','executive_decisions','scenarios',
    'recon_exceptions','recon_match_items','recon_matches','reconciliations','cash_ledger_items','bank_transactions','bank_accounts',
    'cash_forecast_items','regulatory_requirements','collection_events','collection_policies','customer_invoices','supplier_invoices','suppliers',
    'variance_commentary','budget_lines','budget_versions','adjustments','gl_entries','financial_periods','chart_of_accounts','departments',
    'settlements','transactions','processing_cost_rates','fee_schedules','pricing_agreements','onboarding_cases','support_incidents','platform_uptime',
    'merchants','merchant_groups','verticals','products','payment_methods','acquirers','import_source_rows','source_files','import_batches',
    'exchange_rates','audit_events']
  LOOP
    EXECUTE format('DELETE FROM %I WHERE tenant_id = $1', tbl) USING t;
  END LOOP;
  PERFORM set_config('app.allow_demo_purge', 'off', true);
END $$;
REVOKE ALL ON FUNCTION purge_demo_tenant_data(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purge_demo_tenant_data(uuid) TO mips_app;
