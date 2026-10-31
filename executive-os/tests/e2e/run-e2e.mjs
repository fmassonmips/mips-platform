// Runs the acceptance scenario. If BASE_URL is unset, it expects a server at http://localhost:3100.
import { spawnSync } from 'node:child_process';
const r = spawnSync('node', ['tests/e2e/acceptance.cjs'], { stdio: 'inherit', env: process.env });
process.exit(r.status ?? 1);
