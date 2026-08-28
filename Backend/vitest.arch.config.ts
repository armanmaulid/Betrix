// vitest.arch.config.ts
// Config khusus untuk arch-test (architecture rules)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tools/arch-test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
});
