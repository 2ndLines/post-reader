# 0015 iOS 两套外观与 Liquid Glass

- 状态：已批准
- 日期：2026-11-26

## 背景

用 iOS 27 SDK 构建时 `UIDesignRequiresCompatibility` 被忽略，iOS 26 及以上强制 Liquid Glass；部署目标 iOS 18。

## 决策

系统组件采用系统外观；Liquid Glass 只用于导航与控制层，内容层实色；自建悬浮层统一用 `PRGlassSurface`；快照在 iOS 18 与 iOS 27 各一套。

## 备选方案与不选的理由

用兼容开关回避：已不可行。

## 后果（正面、负面、需要跟进的事项）

正面：外观与系统一致。负面：测试矩阵翻倍。

## 影响的文档与代码

01 §23；iOS PRD 第 8 节、IOS-A11Y-04；05 §1
