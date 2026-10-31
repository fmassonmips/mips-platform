import Link from 'next/link';
export default async function Forbidden({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  return (
    <div className="grid min-h-screen place-items-center px-4"><div className="card max-w-md p-6 text-center">
      <h1 className="text-lg font-semibold">Access denied</h1>
      <p className="mt-2 text-sm text-muted">Your role does not include the permission required for this page{p ? <> (<code>{p}</code>)</> : null}. Ask a tenant administrator if you need access.</p>
      <Link href="/executive" className="btn mt-4">Back to overview</Link>
    </div></div>
  );
}
