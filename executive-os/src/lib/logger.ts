/** Structured JSON logger (stdout) + optional error webhook for centralised monitoring. */
type Level = 'debug' | 'info' | 'warn' | 'error';
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const min = order[(process.env.LOG_LEVEL as Level) ?? 'info'] ?? 20;
const REDACT = /password|secret|token|authorization|cookie|mfa/i;

function redact(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) out[k] = REDACT.test(k) ? '[REDACTED]' : v;
  return out;
}

function emit(level: Level, msg: string, meta: Record<string, unknown> = {}) {
  if (order[level] < min) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...redact(meta) });
  (level === 'error' ? console.error : console.log)(line);
  if (level === 'error' && process.env.ERROR_WEBHOOK_URL) {
    fetch(process.env.ERROR_WEBHOOK_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: line }).catch(() => {});
  }
}

export const logger = {
  debug: (m: string, meta?: Record<string, unknown>) => emit('debug', m, meta),
  info: (m: string, meta?: Record<string, unknown>) => emit('info', m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => emit('warn', m, meta),
  error: (m: string, meta?: Record<string, unknown>) => emit('error', m, meta),
};
