/** Prepares mips_eos_test: migrations + reduced-scale DEMO seed (owner role). Tests then use the RLS-bound app role. */
import { migrate } from '../../scripts/migrate';
import { seedAll } from '../../scripts/seed-demo';
export default async function () {
  const owner = process.env.TEST_DATABASE_OWNER_URL ?? 'postgres://mips_owner:owner_dev_pw@localhost:5432/mips_eos_test';
  await migrate(owner, () => {});
  await seedAll(owner, { reset: true, scale: Number(process.env.TEST_SEED_SCALE ?? 0.06), log: () => {} });
}
