# P4-IOS-02 DesignSystem（token、登录组件、首页与播放组件）

## 目标
P4-IOS-02 的完整交付物是 DesignSystem：token，以及 01 §5.2 中登录、首页、播放所需的组件，每个组件带预览与快照测试。本卡完成其中两项：
- 全部 token
- 登录流程需要的 5 个组件

首页与播放的组件放在第二部分。

## 依据
- 手册：playbook §6.6（P4-IOS-02）、§7.7（新增 DesignSystem 组件）
- 架构：01 §5.1（token）、§5.2（组件清单）、§5.3（交互与可访问性）、§23.1（视觉取值以冻结原型为准）
- 视觉基线：冻结原型 `prototype/ios-app`，tag `prototype-frozen-2026-11-23`（在 `Post_Comments_Reader` 仓库），其中的 `DESIGN.md` 与 `src/styles/globals.css`
- 依赖：05 §4.4（swift-snapshot-testing，已定，只用于测试目标）

## 交付物
- `DesignSystem/Sources/DesignSystem/Tokens/`：`PRColor`、`PRFont`、`PRSpace`、`PRRadius`、`PRMotion`、`PRSize`、`PRIcon`
- `DesignSystem/Sources/DesignSystem/Components/`：`PRButton`、`PRIconButton`、`PRCountdownButton`（含纯值类型 `CountdownState`）、`PRTextField`、`PRCodeField`（含 `CodeInput.sanitize`），各带 `#Preview`
- 测试：
  - `LogicTests`：2 条
  - `SnapshotTests`：5 个组件 × 全部状态 × 深浅色 × 3 档字体，共 30 张参考图
- swift-snapshot-testing 1.19.7（精确版本，发布满 3 天）；`DesignSystem/Package.resolved`
- 01 升到 v1.4：§5.1 的圆角取值、§5.2 的实现状态

## 验收标准（助手起草，2026-11-27；负责人确认前视为草案）
1. token 的颜色取自原型的主题变量（浅色 / 深色各一套）。字号全部基于 Dynamic Type 文本样式；圆角取原型层级。页面只能通过 token 取值 —— 代码与注释中的出处
2. 每个组件覆盖 01 §5.2 列出的状态：
   - 按钮：4 种角色、两种尺寸、加载、禁用
   - 倒计时：idle / counting / resend
   - 输入框：空、有值、错误
   - 验证码：空、部分、完成、错误
   —— 快照
3. 可访问性：
   - 图标按钮的 accessibilityLabel 为必填参数
   - 最小点击区域 44 pt
   - 「减弱动态效果」时按下不缩放
   - 错误提示有朗读标签
   - accessibility3 字号下快照中没有截断（长邮箱在单行输入框内省略属于系统行为）
   —— 代码与快照
4. 倒计时 120 s 的阶段计算、验证码的输入清洗 —— 单元测试
5. `make lint`、`make test` 通过，快照连续两次运行结果一致 —— 命令输出

## 范围外（第二部分及以后）
- 首页与播放组件：`PRPostCard`、`PRSegmentedTabs`、`PRMiniPlayer`、`PRPlayerControls`、`PRProgressScrubber`、`PRSpeakerChip`、`PRBottomSheet`
- 其余组件：随设置、订阅、配额等任务卡实现
- `PRGlassSurface`（Liquid Glass，01 §23.4）：只用于导航与控制层，随迷你播放条与标题栏实现
- iOS 18 模拟器上的一套快照（Q3）

## 上下文摘要（助手填写）
填写于 2026-11-27，在负责人 `/goal` 授权下自行推进。本卡叠在 `feat/p4-ios-01` 上。

- 01 §5 规定组件的 API 与行为，视觉取值来自冻结原型。
- 原型的 `DESIGN.md` 给出字号、圆角、按钮与颜色的规范，`globals.css` 给出浅色 / 深色两套主题变量。
- 原型的按钮变体：主操作 default、次操作 secondary、文字按钮 ghost、危险操作 destructiveSolid；全圆角，最小高度 44，按下缩放 0.97，禁用时不透明度 0.45。

## 计划（助手填写）
- **颜色**：在代码中用动态 `UIColor` 定义，与原型变量逐项对应，注释写明出处。01 §5.1 写的是「资产目录中各含 Light / Dark」，两者效果相同；改用代码是为了让数值可以审阅、有单一来源（Q4）。
- **字号**：映射到最接近的 Dynamic Type 文本样式，随系统字号缩放。
- **倒计时**：拆成纯值类型 `CountdownState` 与按阶段渲染的视图。快照只用后者，不受当前时间影响。
- **快照**：每个组件一张图，内含全部状态。
  - 6 个变体：浅色 / 深色 × xSmall / large / accessibility3。
  - 容差 `perceptualPrecision 0.98`。
  - 录制需要 `TEST_RUNNER_SNAPSHOT_TESTING_RECORD=all`：xcodebuild 只把带 `TEST_RUNNER_` 前缀的环境变量传给模拟器里的测试进程。

## 风险与问题（助手填写）
- **Q1 正文字号**：原型的「正文 / 行内值」为 14 / 20，iOS 没有对应的文本样式，暂用 subheadline 15 / 20。如果坚持 14，需要自定义字号并用 `UIFontMetrics` 缩放。
- **Q2 原型没有的颜色**：
  - `textTertiary`：用系统的 `tertiaryLabel`。
  - `speakerPalette`：用 8 个系统色。长度应等于音色槽位上限，而槽位上限待各档位的音色表确定。
- **Q3 iOS 18 快照**：apps/ios/AGENTS.md 要求 iOS 18 与 iOS 27 各一套，本机只有 iOS 27.2 运行时。需要负责人决定：在本机安装 iOS 18 运行时，或者只在 Xcode Cloud 上录制。
- **Q4 颜色定义的位置**：用代码而不是资产目录，见计划。
- **R1 验证码格**：隐藏的输入框负责承接输入与系统的验证码自动填充。它的文字起初会在格子后面露出残影（快照里可见），已改为缩到 1 pt 且近乎透明。需要真机验证邮件或短信验证码的自动填充是否正常。

## 交接记录（会话结束时填写）
**2026-11-27 · AC1–AC5 已完成，在本机验证**
- **AC5**：
  - `make test` 两次都是 `** TEST SUCCEEDED **`，30 张快照与参考图一致。
  - `make lint`：SwiftLint 无输出，`0/55 files require formatting`。
- **过程中发现并修正的问题**：
  - 验证码格的残影。
  - 倒计时快照随当前时间变化（跨秒会抖动）。
  - 录制开关没有传进模拟器（需要 `TEST_RUNNER_` 前缀）。
- **需真机验证**：验证码自动填充（R1）。
- **人工检查点**：负责人对照冻结原型确认视觉（playbook §6.6），参考图在 `__Snapshots__/` 中。
- **下一步**：第二部分（首页与播放组件），或 P4-IOS-03（Storage）。

## 第二部分：首页与播放组件（2026-11-27）
- **组件**：
  - `PRSegmentedTabs`：首页「推荐 / 收藏」
  - `PRPostCard`：显示数据为 `PostCardModel`，**不含任何计数**；状态 default / playing / capturing / needsSiteLogin / failed；有图片 +N、视频时长、「样帖试听」斜角标
  - `PRMiniPlayer`：playing / paused / buffering，本机语音标签，没有下一篇时禁用
  - `PRSpeakerChip`：槽位超出色带长度时循环取色
  - `PRProgressScrubber`：按章节分段；可访问性上为可调节元素，按章节跳转
  - `PRPlayerControls`：首位时上一篇禁用，显示倍速
- **视觉出处**：原型 `post-card.tsx`（卡片布局、缩略图 80×60、圆角 12、斜角标）、`ios-device-viewport.tsx`（迷你播放条高 56 的胶囊）、`home-screen.tsx`（标签 22 / 28 粗体，未选中 60%）。
- **原型没有的状态**：卡片的 playing / capturing / failed 状态与播放页控件的布局，原型都没有给出。目前按系统惯例实现：图标加文字、强调色或危险色，待视觉确认（Q5）。
- **测试**：
  - 快照新增 36 张，共 66 张，连续两次运行一致；全量重新录制后，第一部分的 30 张没有变化。
  - 逻辑测试新增 1 条：进度条的当前章节计算。
- **修正**：卡片摘要在只给理想尺寸的布局中只显示一行，已加 `fixedSize(vertical:)`。
- **Q5 待负责人确认**：卡片 playing / capturing / failed 三种状态的样式；播放页控件的布局（原型的播放页不在本次范围内对照）。
- **R2**：迷你播放条在深色模式下用系统材质，与背景的对比较弱。`PRGlassSurface` 实现时一并处理。
