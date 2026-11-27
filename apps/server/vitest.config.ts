import { sharedConfig } from '@post-reader/tooling/vitest';
import { defineConfig, mergeConfig } from 'vitest/config';

// 单元测试：不含需要真实数据库的 *.int.test.ts（由 vitest.int.config.ts 运行）
export default mergeConfig(
  sharedConfig,
  defineConfig({ test: { exclude: ['**/node_modules/**', '**/*.int.test.ts'] } }),
);
