import type { Tx } from './db';
/** Multi-row parameterised insert, chunked below the 65 535 parameter limit. */
export async function insertMany(tx: Tx, table: string, columns: string[], rows: unknown[][], returning?: string): Promise<any[]> {
  const out: any[] = [];
  if (!rows.length) return out;
  const per = Math.max(1, Math.floor(60000 / columns.length));
  for (let i = 0; i < rows.length; i += per) {
    const chunk = rows.slice(i, i + per);
    const params: unknown[] = [];
    const values = chunk.map((r) => `(${r.map((v) => { params.push(v); return `$${params.length}`; }).join(',')})`).join(',');
    const res = await tx.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES ${values}${returning ? ` RETURNING ${returning}` : ''}`, params as any[]);
    if (returning) out.push(...res.rows);
  }
  return out;
}
