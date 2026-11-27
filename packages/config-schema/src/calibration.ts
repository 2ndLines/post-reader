/**
 * 未标定参数的显式表示（docs 写作规则 §4：不为显得完整而补成未确认的参数）。
 * PRD 中标为「待标定」的值（Q_*、R_daily、令牌桶等）在配置里写成 `{ uncalibrated: true, source: <标定依据> }`，
 * 不写 0、不写猜测值。开发与测试环境可以加载；生产环境由 `assertCalibrated` 拒绝。
 */
import { z } from 'zod';

export const Uncalibrated = z.object({
  uncalibrated: z.literal(true),
  /** 标定依据或负责方，例如《商业化精算与配额配置表》 */
  source: z.string().min(1),
});
export type Uncalibrated = z.infer<typeof Uncalibrated>;

/** 值要么已标定（满足 schema），要么显式标为未标定 */
export function calibrated<T extends z.ZodType>(schema: T) {
  return z.union([schema, Uncalibrated]);
}

export function isUncalibrated(value: unknown): value is Uncalibrated {
  return Uncalibrated.safeParse(value).success;
}

/** 列出配置中所有未标定值的路径与依据 */
export function listUncalibrated(
  value: unknown,
  path: string[] = [],
): { path: string; source: string }[] {
  if (isUncalibrated(value)) return [{ path: path.join('.'), source: value.source }];
  if (Array.isArray(value))
    return value.flatMap((v, i) => listUncalibrated(v, [...path, String(i)]));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => listUncalibrated(v, [...path, k]));
  }
  return [];
}

/** 生产环境启动时调用：存在任何未标定值即抛错 */
export function assertCalibrated(name: string, value: unknown): void {
  const missing = listUncalibrated(value);
  if (missing.length > 0) {
    const detail = missing.map((m) => `${m.path}（${m.source}）`).join('；');
    throw new Error(`${name} 仍有未标定的参数，生产环境拒绝加载：${detail}`);
  }
}
