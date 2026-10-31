-- =====================================================================
-- 006 — SECURITY FIX: demo_purge_allowed() returned NULL when the GUC was
-- unset (NULL = 'on' → NULL), and a trigger WHEN clause evaluating to NULL
-- does not fire — silently disabling delete protection. Found by the
-- integration test suite. The function now always returns a boolean.
-- =====================================================================
CREATE OR REPLACE FUNCTION demo_purge_allowed(t uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(current_setting('app.allow_demo_purge', true), '') = 'on'
     AND coalesce((SELECT is_demo FROM tenants WHERE id = t), false)
$$;
