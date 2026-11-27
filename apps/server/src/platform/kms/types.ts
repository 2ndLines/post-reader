/**
 * 包裹与解包用户 DEK 的 KMS 抽象（02 §8 `platform/kms`：阿里云 KMS / AWS KMS，由本层屏蔽差异）。
 * 受保护路径。云厂商实现在有账号后加入（AWS：P3-INFRA-01；阿里云：P10）；本地与测试使用 LocalFileKms。
 */
export interface Kms {
  /** 主密钥标识，写入 user_keys.kms_key_id */
  readonly keyId: string;
  wrapDek(dek: Uint8Array): Promise<Uint8Array>;
  unwrapDek(wrapped: Uint8Array): Promise<Uint8Array>;
}
