/**
 * Fastify 的 zod 校验与序列化（代替 fastify-type-provider-zod：其 v7 把 @fastify/swagger 列为必需的 peer，
 * 会引入未登记的依赖，P2-SRV-01 Q1）。
 * - 请求：schema 校验失败时抛出 RequestValidationError，由 errorHandler 转为 VALIDATION_FAILED，detail 只含字段路径。
 * - 响应：按响应 schema parse 后再序列化，未声明的字段被丢弃（响应 schema 同时是字段白名单，05 §4.2）。
 */
import type { FastifySchemaCompiler, FastifySerializerCompiler } from 'fastify';
import type { z } from 'zod';

export class RequestValidationError extends Error {
  readonly paths: string[];

  constructor(paths: string[]) {
    super('request validation failed');
    this.name = 'RequestValidationError';
    this.paths = paths;
  }
}

export const zodValidatorCompiler: FastifySchemaCompiler<z.ZodType> =
  ({ schema, httpPart }) =>
  (data) => {
    const result = schema.safeParse(data);
    if (result.success) return { value: result.data };
    const paths = result.error.issues.map((issue) =>
      [httpPart, ...issue.path].filter(Boolean).join('.'),
    );
    return { error: new RequestValidationError([...new Set(paths)]) };
  };

export const zodSerializerCompiler: FastifySerializerCompiler<z.ZodType> =
  ({ schema }) =>
  (data) =>
    JSON.stringify(schema.parse(data));
