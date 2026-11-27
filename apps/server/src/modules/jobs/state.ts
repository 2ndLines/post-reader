/**
 * 任务状态机（02 §5.4；《完整技术架构》§9.1）。
 * 主链：created → admitted → planning → scripting → synthesizing → completed；created 可转 rejected，synthesizing 可转 quota_exhausted。
 * 任何非终态都可以转为 failed（流水线异常）或 cancelled（用户取消）（§9.1 未列出，P3-SRV-01 Q3）。
 */
import { and, eq, inArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { JOB_STATES, jobs } from './schema.ts';

export type JobState = (typeof JOB_STATES)[number];

const MAIN: Partial<Record<JobState, readonly JobState[]>> = {
  created: ['admitted', 'rejected'],
  admitted: ['planning'],
  planning: ['scripting'],
  scripting: ['synthesizing'],
  synthesizing: ['completed', 'quota_exhausted'],
};

const TERMINAL_STATES: readonly JobState[] = [
  'completed',
  'rejected',
  'failed',
  'cancelled',
  'quota_exhausted',
];

export function isTerminal(state: JobState): boolean {
  return TERMINAL_STATES.includes(state);
}

export function canTransition(from: JobState, to: JobState): boolean {
  if (isTerminal(from)) return false;
  if (to === 'failed' || to === 'cancelled') return true;
  return MAIN[from]?.includes(to) ?? false;
}

/** 允许转入 `to` 的全部来源状态 */
function sourcesOf(to: JobState): JobState[] {
  return JOB_STATES.filter((from) => canTransition(from, to));
}

/**
 * 条件更新：只有当前状态是允许的来源时才转移（并发安全：两个进程同时转移，只有一个成功）。
 * 返回是否转移成功；进入终态时写 completed_at。
 */
export async function transitionJob(
  db: PostgresJsDatabase,
  jobId: string,
  to: JobState,
  now = new Date(),
): Promise<boolean> {
  const rows = await db
    .update(jobs)
    .set({ state: to, ...(isTerminal(to) ? { completedAt: now } : {}) })
    .where(and(eq(jobs.id, jobId), inArray(jobs.state, sourcesOf(to))))
    .returning({ id: jobs.id });
  return rows.length === 1;
}
