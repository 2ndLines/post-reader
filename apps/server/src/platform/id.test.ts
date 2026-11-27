import { describe, expect, it } from 'vitest';
import { newId } from './id.ts';

describe('newId（UUIDv7，00 §4.2）', () => {
  it('版本位为 7、变体位为 RFC 9562', () => {
    const id = newId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('按生成时间有序（索引友好）', () => {
    const ids = Array.from({ length: 1000 }, () => newId());
    expect([...ids].sort()).toEqual(ids);
  });
});
