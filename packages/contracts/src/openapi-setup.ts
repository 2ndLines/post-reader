/**
 * 给 zod 加上 openapi()（zod-to-openapi 的 registry 依赖它）。
 * zod 4 的方法在创建 schema 时挂到实例上，补丁只对之后创建的 schema 生效：
 * 必须在加载任何契约 schema 之前引入本文件，所以生成脚本与测试先引入它，再用动态 import 加载 openapi.ts。
 * 这是全局副作用，只在生成 OpenAPI 的进程中使用，不从 index.ts 导出。
 */
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);
