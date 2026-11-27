/** 服务端主键：应用生成的 UUIDv7（00 §4.2；按时间有序，索引友好） */
import { v7 } from 'uuid';

export function newId(): string {
  return v7();
}
