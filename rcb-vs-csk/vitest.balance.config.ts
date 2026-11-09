import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['scripts/balance.bench.ts'], testTimeout: 600000 },
});
