/**
 * 基础枚举（00 §3.1「基础枚举」表，取值与顺序以该表为准）。
 * 每个枚举同时导出 zod schema 与 TS 类型；新增取值属于「只增不改」，删除或改名需要提升协议版本。
 */
import { z } from 'zod';

export const Region = z.enum(['cn', 'intl']);
export type Region = z.infer<typeof Region>;

export const Platform = z.enum(['ios', 'android', 'web']);
export type Platform = z.infer<typeof Platform>;

export const StoreProvider = z.enum(['apple', 'google', 'web']);
export type StoreProvider = z.infer<typeof StoreProvider>;

export const AttestProvider = z.enum(['app_attest', 'play_integrity', 'web_risk']);
export type AttestProvider = z.infer<typeof AttestProvider>;

export const Jurisdiction = z.enum(['cn', 'eu_eea', 'uk', 'us_ca', 'us_other', 'row']);
export type Jurisdiction = z.infer<typeof Jurisdiction>;

export const Tier = z.enum(['free', 'plus', 'pro']);
export type Tier = z.infer<typeof Tier>;

export const CacheScope = z.enum(['PUBLIC', 'PRIVATE']);
export type CacheScope = z.infer<typeof CacheScope>;

export const Emotion = z.enum([
  'NEUTRAL',
  'EMPHATIC',
  'SARCASTIC',
  'LAUGHING',
  'DOUBTFUL',
  'SOLEMN',
  'EXCITED',
  'WHISPER',
]);
export type Emotion = z.infer<typeof Emotion>;

/** `deep` 仅 `pro` 可用（档位校验在服务端，契约只定义取值） */
export const Density = z.enum(['brief', 'standard', 'deep']);
export type Density = z.infer<typeof Density>;

export const Weight = z.enum(['op_replies', 'practical_reversal', 'dedupe_spam']);
export type Weight = z.infer<typeof Weight>;

export const Style = z.enum([
  'solo_radio',
  'duo_roundtable',
  'fireside',
  'rapid_cut',
  'crowd_list',
]);
export type Style = z.infer<typeof Style>;

export const Branch = z.enum(['same_lang', 'translate']);
export type Branch = z.infer<typeof Branch>;

/** BCP 47 语言标签（00 §4.3），只做形态校验：主语言 2–3 个字母，后接若干 1–8 位字母数字子标签 */
export const LangTag = z
  .string()
  .regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{1,8})*$/, '不是有效的 BCP 47 语言标签');
export type LangTag = z.infer<typeof LangTag>;

/** UTC ISO 8601 时间（00 §4.3：时间一律 UTC 传输） */
export const UtcDateTime = z.iso.datetime();
export type UtcDateTime = z.infer<typeof UtcDateTime>;

/** 64 位小写十六进制 SHA-256 */
export const Sha256Hex = z.string().regex(/^[0-9a-f]{64}$/, '应为 64 位小写十六进制');
export type Sha256Hex = z.infer<typeof Sha256Hex>;
