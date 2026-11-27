/** 结构化偏好（00 §3.1 prefs.ts；样例见 04 §6：`{ density: standard, weights: [dedupe_spam], style: solo_radio }`） */
import { z } from 'zod';
import { Density, Style, Weight } from './common.ts';

export const Prefs = z.object({
  density: Density,
  /** 启用的加权开关；不重复 */
  weights: z
    .array(Weight)
    .refine((w) => new Set(w).size === w.length, { error: 'weights 不能重复' }),
  style: Style,
});
export type Prefs = z.infer<typeof Prefs>;
