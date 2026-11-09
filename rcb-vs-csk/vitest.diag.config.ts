import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['scripts/diag.bench.ts'], testTimeout: 600000 } });
