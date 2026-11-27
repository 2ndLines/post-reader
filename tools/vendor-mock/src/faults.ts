/**
 * 故障注入规则（由测试通过 /__mock/faults 设置，被测代码无需知道自己连的是 mock）。
 * - latency：额外等待后正常响应；status：直接返回指定状态码；timeout：一直不响应，直到客户端放弃；
 *   reset：直接断开连接。times 省略表示一直生效，否则命中指定次数后自动失效。
 */
export type Fault =
  | { kind: 'latency'; ms: number }
  | { kind: 'status'; status: number }
  | { kind: 'timeout' }
  | { kind: 'reset' };

export interface FaultRule {
  /** 路径前缀；省略表示所有路径 */
  pathPrefix?: string;
  fault: Fault;
  times?: number;
}

export class FaultTable {
  #rules: FaultRule[] = [];

  set(rules: FaultRule[]): void {
    this.#rules = rules.map((r) => ({ ...r }));
  }

  clear(): void {
    this.#rules = [];
  }

  /** 取出第一条匹配的规则并计数；用完的规则被移除 */
  take(path: string): Fault | undefined {
    const index = this.#rules.findIndex(
      (r) => r.pathPrefix === undefined || path.startsWith(r.pathPrefix),
    );
    if (index === -1) return undefined;
    const rule = this.#rules[index] as FaultRule;
    if (rule.times !== undefined) {
      rule.times -= 1;
      if (rule.times <= 0) this.#rules.splice(index, 1);
    }
    return rule.fault;
  }
}
