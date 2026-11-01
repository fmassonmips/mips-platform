import type { Tx } from './db';

/** Append an immutable, hash-chained audit event in the current tenant transaction. */
export async function audit(tx: Tx, e: { tenantId: string; userId: string | null; action: string; entityType: string; entityId?: string | null; payload?: unknown; actorLabel?: string }) {
  await tx.query(
    `INSERT INTO audit_events (tenant_id, actor_user_id, actor_label, action, entity_type, entity_id, payload, hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')`,
    [e.tenantId, e.userId, e.actorLabel ?? null, e.action, e.entityType, e.entityId ?? null, JSON.stringify(e.payload ?? {})],
  );
}

/** Recompute the hash chain for a tenant; returns the first broken event id, if any. */
export async function verifyAuditChain(tx: Tx): Promise<{ ok: boolean; checked: number; brokenAt: string | null }> {
  const r = await tx.query(`
    WITH c AS (
      SELECT id, hash, prev_hash,
        lag(hash) OVER (ORDER BY id) AS expected_prev,
        encode(digest(coalesce(prev_hash,'GENESIS') || '|' || tenant_id::text || '|' || coalesce(actor_user_id::text,'') || '|' ||
          action || '|' || entity_type || '|' || coalesce(entity_id,'') || '|' || payload::text || '|' ||
          to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), 'sha256'), 'hex') AS recomputed
      FROM audit_events)
    SELECT count(*)::text AS n,
      (SELECT id::text FROM c WHERE recomputed <> hash OR prev_hash IS DISTINCT FROM expected_prev ORDER BY id LIMIT 1) AS broken
    FROM c`);
  const row = r.rows[0];
  return { ok: !row.broken, checked: Number(row.n), brokenAt: row.broken };
}
