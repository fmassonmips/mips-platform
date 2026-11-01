import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    environment: 'node', include: ['tests/integration/**/*.test.ts'], globalSetup: ['tests/integration/global-setup.ts'],
    testTimeout: 120000, hookTimeout: 600000, fileParallelism: false,
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://mips_app:app_dev_pw@localhost:5432/mips_eos_test', LOG_LEVEL: 'error' },
  },
});
