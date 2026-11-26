/** 最小示例：用于验证共享 tsconfig、vitest 与 turbo 管线本身可用，不承载业务逻辑 */
export function sum(values: readonly number[]): number {
  return values.reduce((total,value)=>total+value,0);
}
