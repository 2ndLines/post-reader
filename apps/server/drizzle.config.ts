// 迁移只用 drizzle-kit generate 生成（02 §17 第 5 条）；已发布的迁移不得修改；drizzle/ 为受保护路径
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/modules/*/schema.ts',
  out: './drizzle',
  strict: true,
});
