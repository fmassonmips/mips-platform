import { notFound } from 'next/navigation';
import { pageContext, tx, type SP } from '@/lib/page';
import { getReport } from '@/lib/services/reports';
import { SectionView } from '../view';
export const dynamic = 'force-dynamic';
/** Presentation-ready view: one 16:9 slide per heading; print to PDF for a deck. */
export default async function Present({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { auth } = await pageContext(searchParams, 'dashboard.view');
  const { id } = await params; if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const r = await tx(auth, (t) => getReport(t, id)); if (!r) notFound();
  const c = r.content; const slides: any[][] = [];
  for (const s of c.sections) { if (s.type === 'heading' || !slides.length) slides.push([]); slides[slides.length - 1].push(s); }
  return (
    <div className="space-y-6">
      <style>{`@media print { @page { size: 13.333in 7.5in; margin: 0.4in } .slide { break-after: page; height: auto } }`}</style>
      <div className="slide card flex aspect-video flex-col justify-center bg-navy p-12 text-white"><div className="text-sm font-semibold uppercase tracking-widest text-gold">MIPS Executive OS</div><h1 className="mt-3 text-3xl font-semibold">{c.title}</h1><p className="mt-2 text-white/70">{c.tenant} · {c.period.start} → {c.period.end}</p>{c.is_demo && <p className="mt-6 font-semibold text-gold">DEMO DATA — synthetic, not actual results</p>}<p className="mt-auto text-xs text-white/50">Data status: {r.data_status} · SHA-256 {r.content_sha256.slice(0, 16)}…</p></div>
      {slides.map((sl, i) => <div key={i} className="slide card aspect-video overflow-hidden p-8">{sl.map((s, j) => <SectionView key={j} s={s} />)}</div>)}
      <p className="no-print text-xs text-muted">Use your browser’s Print → Save as PDF (landscape) to produce a slide deck from this view.</p>
    </div>
  );
}
