/**
 * 解包后的 DEK 进程内缓存（02 §8：LRU，5 分钟）。注销时必须调用 invalidate，避免密钥删除后仍能从缓存解密。
 */
export class DekCache {
  readonly #entries = new Map<string, { dek: Uint8Array; expiresAt: number }>();
  readonly #ttlMs: number;
  readonly #maxEntries: number;
  readonly #now: () => number;

  constructor(options: { ttlMs?: number; maxEntries?: number; now?: () => number } = {}) {
    this.#ttlMs = options.ttlMs ?? 5 * 60_000;
    this.#maxEntries = options.maxEntries ?? 10_000;
    this.#now = options.now ?? Date.now;
  }

  /** 命中且未过期时返回 DEK，并把该项移到最近使用的位置 */
  get(userId: string): Uint8Array | undefined {
    const entry = this.#entries.get(userId);
    if (!entry) return undefined;
    this.#entries.delete(userId);
    if (entry.expiresAt <= this.#now()) return undefined;
    this.#entries.set(userId, entry);
    return entry.dek;
  }

  set(userId: string, dek: Uint8Array): void {
    this.#entries.delete(userId);
    this.#entries.set(userId, { dek, expiresAt: this.#now() + this.#ttlMs });
    while (this.#entries.size > this.#maxEntries) {
      const oldest = this.#entries.keys().next().value as string;
      this.#entries.delete(oldest);
    }
  }

  /** 注销或密钥轮换时清除 */
  invalidate(userId: string): void {
    this.#entries.delete(userId);
  }

  get size(): number {
    return this.#entries.size;
  }
}
