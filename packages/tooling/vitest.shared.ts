import { defineConfig } from 'vitest/config';

/** 各包通过 mergeConfig(sharedConfig, defineConfig({...})) 引用；覆盖率统一用 v8（05 §4.1） */
export const sharedConfig = defineConfig({
  test: {
    include: ['**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: 'coverage',
    },
  },
});
