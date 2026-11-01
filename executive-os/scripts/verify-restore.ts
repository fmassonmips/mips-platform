/** Post-restore verification (filters every query by tenant explicitly — may run as a superuser): migrations recorded, row counts, audit hash chain per tenant, journal balance. */
import { Client } from 'pg';
import { loadEnv } from './env';
loadEnv();
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_OWNER_URL }); await c.connect();
  const mig = (await c.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n;
  const tenants = (await c.query('SELECT id, code FROM tenants ORDER BY code')).rows;
  let ok = mig > 0;
  console.log(`migrations recorded: ${mig}`);
  for (const t of tenants) {
    await c.query("SELECT set_config('app.tenant_id', $1, false)", [t.id]);
    const counts = (await c.query('SELECT (SELECT count(*) FROM transactions WHERE tenant_id = $1)::int AS txns, (SELECT count(*) FROM gl_entries WHERE tenant_id = $1)::int AS gl, (SELECT count(*) FROM audit_events WHERE tenant_id = $1)::int AS audit', [t.id])).rows[0];
    const chain = (await c.query(`WITH x AS (SELECT hash, prev_hash, lag(hash) OVER (ORDER BY id) AS expected,
        encode(digest(coalesce(prev_hash,'GENESIS') || '|' || tenant_id::text || '|' || coalesce(actor_user_id::text,'') || '|' || action || '|' || entity_type || '|' || coalesce(entity_id,'') || '|' || payload::text || '|' || to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), 'sha256'), 'hex') AS re FROM audit_events WHERE tenant_id = $1)
      SELECT count(*) FILTER (WHERE re <> hash OR prev_hash IS DISTINCT FROM expected)::int AS broken FROM x`, [t.id])).rows[0].broken;
    const unbalanced = (await c.query('SELECT count(*)::int AS n FROM (SELECT journal_ref FROM gl_entries WHERE tenant_id = $1 GROUP BY journal_ref HAVING sum(debit_base) <> sum(credit_base)) j', [t.id])).rows[0].n;
    console.log(`${t.code}: ${counts.txns} transactions, ${counts.gl} GL lines, ${counts.audit} audit events, chain breaks ${chain}, unbalanced journals ${unbalanced}`);
    if (chain || unbalanced) ok = false;
  }
  await c.end();
  console.log(ok ? 'RESTORE VERIFIED' : 'RESTORE VERIFICATION FAILED'); process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
