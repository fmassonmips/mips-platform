import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageContext, tx, spGet, type SP } from '@/lib/page';
import { TEMPLATES, type TemplateKey } from '@/lib/engine/scenarios';
import { FIELD_META, DEFAULTS } from '@/lib/engine/scenario-fields';
import { defaultBasePeriod } from '@/lib/services/decisions';
import { q } from '@/lib/db';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ScenarioForm, type FieldDef } from '../forms';

export const dynamic = 'force-dynamic';

export default async function NewScenario({ searchParams }: { searchParams: SP }) {
  const { auth, sp } = await pageContext(searchParams, 'scenario.manage');
  const template = spGet(sp, 'template') as TemplateKey;
  const def = TEMPLATES[template];
  if (!def) notFound();
  const { merchants, base } = await tx(auth, async (t) => ({ merchants: await q<{ id: string; name: string }>(t, "SELECT id, name FROM merchants WHERE status <> 'churned' ORDER BY name"), base: await defaultBasePeriod(t) }));
  const shape = (def.schema as any).shape as Record<string, any>;
  const fields: FieldDef[] = Object.keys(shape).map((k) => {
    let dflt = '';
    try { const r = shape[k].safeParse(undefined); if (r.success && r.data !== undefined) dflt = String(r.data); } catch { /* required */ }
    const meta = FIELD_META[k] ?? { label: k };
    return { key: k, label: meta.label, hint: meta.hint, kind: meta.kind, value: spGet(sp, k) ?? DEFAULTS[template]?.[k] ?? dflt };
  });
  const merchantName = merchants.find((m) => m.id === spGet(sp, 'merchantId'))?.name;
  return (
    <div>
      <PageHeader eyebrow="CEO Decision Center · New scenario" title={def.label} subtitle={def.description} actions={<Link className="btn" href="/decisions">Back</Link>} />
      <Card>
        <CardHeader title="Assumptions" subtitle={`Base period defaults to the 3 latest complete months (${base.start} → ${base.end}); the engine uses monthly averages of actual data for that period.`} />
        <CardBody>
          <ScenarioForm template={template} fields={fields} merchants={merchants} defaults={{ name: spGet(sp, 'name') ?? (merchantName ? `${def.label} — ${merchantName}` : def.label), comparisonGroup: spGet(sp, 'group') ?? '', baseStart: base.start, baseEnd: base.end }} />
        </CardBody>
      </Card>
    </div>
  );
}
