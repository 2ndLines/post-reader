import { defineConfig } from 'vitest/config';

// 集成测试（02 §15、§17 第 3 条）：真实 PostgreSQL，不 mock 数据库。
// 连接 TEST_DATABASE_URL（默认是 pnpm dev 拉起的本地容器）；每个测试文件建一个临时数据库并在结束时删除。
export default defineConfig({
  test: {
    include: ['src/**/*.int.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
