// Logs in through the real login page (server action) using Playwright and writes a Netscape cookie jar.
const { chromium } = require('playwright');
const { writeFileSync } = require('node:fs');
(async () => {
  const [email, pass, base, jar] = process.argv.slice(2);
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto(`${base}/login`); await p.fill('#email', email); await p.fill('#password', pass);
  await Promise.all([p.waitForURL(/executive|mfa/, { timeout: 180000 }), p.click('button[type=submit]')]);
  const cookies = await p.context().cookies();
  writeFileSync(jar, '# Netscape HTTP Cookie File\n' + cookies.map((c) => [c.domain, 'FALSE', c.path, c.secure ? 'TRUE' : 'FALSE', Math.floor(c.expires > 0 ? c.expires : Date.now() / 1000 + 3600), c.name, c.value].join('\t')).join('\n') + '\n');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
