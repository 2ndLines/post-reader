/** /samples、/config/bundle、/subscriptions/sync、/webhooks/app-store、健康检查（02 §4.2；配置包签名见 ADR 0018） */
import { z } from 'zod';
import { LangTag, Tier, UtcDateTime } from '../common.ts';
import { QuotaSummary } from './me.ts';

export const Sample = z.object({
  sampleId: z.string().min(1),
  title: z.string(),
  lang: LangTag,
  /** 静态音频的签名 URL */
  audioUrl: z.url(),
  expiresAt: UtcDateTime,
  durationMs: z.int().positive(),
  /** 播报脚本：按顺序的角色与文本 */
  script: z.array(z.object({ role: z.enum(['host', 'op', 'commenter']), text: z.string() })),
});
export const SamplesResponse = z.object({ samples: z.array(Sample) });

/** client 类配置包与签名信封（00 §5、ADR 0018：alg + kid，ECDSA 为 P1363 原始格式） */
export const ConfigBundleResponse = z.object({
  /** 配置包 JSON 的 base64 */
  bundle: z.string().min(1),
  signature: z.object({
    alg: z.enum(['Ed25519', 'ES256']),
    kid: z.string().min(1),
    /** 签名值，base64url */
    sig: z.string().min(1),
  }),
});

export const SubscriptionSyncRequest = z.object({ signedTransactionInfo: z.string().min(1) });
export const SubscriptionSyncResponse = z.object({ tier: Tier, quota: QuotaSummary });

export const AppStoreNotification = z.object({ signedPayload: z.string().min(1) });

export const Health = z.object({ status: z.literal('ok') });
