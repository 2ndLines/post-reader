# P1-SPEC-01 `packages/canonical-spec`：清洗与摘要规格、TS 参考实现、黄金向量

## 目标
把 00 §3.2 的清洗与摘要规则写成可以逐字实现的规格（`SPEC.md`），提供 TS 参考实现与 7 类黄金向量。iOS 侧（P1-IOS-01）用同一组向量实现 Swift 版本，两侧 100% 一致是 P1 的出口条件。

## 依据
- 架构：00 §3.2（规则与向量格式）、D3（SSML 转义放在 TTS 边界）；01 §3（`ReaderCore` 的 `Cleaner`、`UnitHasher`）
- 手册：playbook §6.3（P1 出口条件与人工检查点）、§9.2（「清洗或摘要」改动需跑两侧黄金向量）、§9.4（`packages/canonical-spec/**` 为受保护路径）

## 交付物
- `packages/canonical-spec/`：`SPEC.md`；`src/clean.ts`、`src/hash.ts`、`src/index.ts`；`src/vectors.test.ts`
- `vectors/` 下 7 个文件：`cjk`、`emoji-zwj`、`bidi`、`zero-width`、`html-entities`、`whitespace`、`edge-cases`
- `scripts/expected_hash.py`：独立于 TS 实现的摘要计算（只用 Python 标准库），用于生成和复核 `expectedHash`
- 根脚本 `pnpm spec:vectors`

## 验收标准（助手起草，2026-11-26；负责人确认前视为草案）
1. 7 个向量文件、每个至少 3 条向量，TS 参考实现全部通过 —— `pnpm spec:vectors` 输出
2. `expectedClean` 由人工逐条写出，`expectedHash` 由 `scripts/expected_hash.py` 独立计算，不由被测实现生成；`lp` 的字节布局另有手算的单元测试 —— 测试与脚本输出
3. `SPEC.md` 对每一步给出精确的字符集或码位范围，不依赖平台的 Unicode 属性 API（Swift 没有 Script 属性）；00 §3.2 中有歧义的地方逐条列出所采用的默认解读 —— 文档
4. `pnpm verify`、`pnpm knip`、CI 全绿 —— 输出
5. `schemaVersion = 1` 不冻结：`SPEC.md` 标注为「草案，待负责人确认（playbook §6.3 人工检查点）」 —— 文档

## 范围外
Swift 实现（P1-IOS-01）；SSML 转义（D3：在 TTS 边界，P3）；`contracts` 中 `CanonicalPost` 的 schema（P1-CTR-01）。

## 上下文摘要（助手填写）

填写于 2026-11-26，在负责人 `/goal` 授权下自行推进。本卡叠在 `feat/p0-repo-04` 上。

- **00 §3.2 的规则**：
  1. 解码 HTML 实体
  2. NFC 规范化
  3. 删除 C0/C1 控制字符（保留 `\n`）、BOM 与指定的零宽和双向控制字符
  4. ZWNJ 与 ZWJ 只在 emoji 序列或连写文字中保留
  5. 统一换行符，折叠连续空行，去除首尾空白
  6. 不做 SSML 转义
- **摘要**：`SHA256( lp(unitId) ‖ lp(authorId) ‖ lp(cleanText) )`，`lp` 是「4 字节大端长度 + UTF-8 字节」。
- **两侧一致性**：iOS 的 `ReaderCore` 用同一组向量（01 §3）。因此规格不能依赖只有一侧平台才有的 Unicode API，例如 Swift 没有 Unicode Script 属性。
- **规则本身有歧义**：见「风险与问题」Q1–Q6。

## 计划（助手填写）

- **`SPEC.md`**：逐步写明码位集合与处理顺序，列出采用的默认解读；附向量格式、版本规则，以及 `expectedHash` 的生成方法。
- **`src/clean.ts`**：按码位逐个处理，不用正则一次性替换，方便与 Swift 实现逐步对照。
- **`src/hash.ts`**：基于 Web Crypto（`crypto.subtle.digest`），Node 26 与 Workers 都能运行；`lp` 单独导出，便于测试。
- **测试 `src/vectors.test.ts`**：读取 7 个向量文件，逐条断言 `clean(raw) === expectedClean`，以及 `hash(unitId, authorId, expectedClean) === expectedHash`；另外：
  - `lp` 的字节布局用手算的十六进制做单元测试。
  - SHA-256 用标准测试值 `"abc"` 校验。
  - 检查向量本身：名称不重复、每个文件至少 3 条。
- **`scripts/expected_hash.py`**：读取向量，计算并比对 `expectedHash`；加 `--write` 时回写结果。
- **文档同步**：00 §3.2 的规则改为摘要，并指向 `SPEC.md` 作为唯一来源。

## 风险与问题（助手填写）

下面的歧义都按「未决前的默认」实现（ADR 0004），属于 playbook §6.3 的人工检查点，需要负责人确认后才冻结 `schemaVersion = 1`：

- **Q1 步骤顺序**：第 3 步会把 `\r` 当作 C0 控制字符删掉，这样第 5 步「换行统一为 `\n`」就永远遇不到 `\r`，单独出现的 `\r` 两侧的行会被连成一行。
  - 默认：把换行统一提前到删除控制字符之前。CRLF、CR、NEL（U+0085）、LS（U+2028）、PS（U+2029）都转换为 `\n`。
- **Q2 制表符**：U+0009 属于 C0。按原文会被删除，`a\tb` 会变成 `ab`。
  - 默认：按原文删除。
  - 建议：确认时改为替换成空格（U+0020），避免把相邻的词连在一起。
- **Q3 「连写文字上下文」**：原文没有定义。
  - 默认：ZWNJ 或 ZWJ 两侧的码位都属于下列连写文字区段时保留：
    - 阿拉伯文、叙利亚文、N'Ko
    - 天城文至马拉雅拉姆文（U+0900–U+0D7F）、僧伽罗文
    - 蒙古文
    - 阿拉伯文扩展区与表现形式区
  - 具体码位范围见 `SPEC.md`。
- **Q4 「emoji 序列」**：
  - 默认：ZWJ 前面的码位（跳过 VS16 U+FE0F 与 VS15 U+FE0E）具有 Emoji 属性且不是 ASCII，并且后面的码位同样具有 Emoji 属性且不是 ASCII 时保留。
  - ZWNJ 不因 emoji 上下文而保留。
  - Unicode 版本差异（新 emoji）可能使两侧判定不同，向量只用 Unicode 15.1 之前的 emoji。
- **Q5 HTML 实体的范围**：
  - 默认：只解码一遍。解码数字实体（十进制与十六进制）和 5 个命名实体（`&amp;` `&lt;` `&gt;` `&quot;` `&apos;`），外加 `&nbsp;`；不认识的命名实体原样保留。
  - 码点无效时（0、代理区、大于 U+10FFFF）解码为 U+FFFD。
  - 不实现完整的 HTML5 命名实体表：两侧都要维护 2000 多项，而平台采集时拿到的多半已经是解码后的文本。
- **Q6 「空白」的范围**：
  - 默认：首尾去除与「空行」判定都使用 Unicode White_Space 属性中经过第 3 步后仍存在的码位，`SPEC.md` 中逐个列出。
  - 行内空白、行尾空白不做处理。
- **Q7 清洗不是幂等的**（测试中发现）：因为要解码 HTML 实体，`clean(clean(x))` 不一定等于 `clean(x)`，例如 `&amp;lt;` 第一次清洗得到 `&lt;`，再清洗得到 `<`。
  - 影响：服务端重算摘要（P3 的 `POST /jobs`）时，如果对客户端上报的清洗结果再清洗一次，含实体形式文本的帖子会出现摘要不一致。
  - 默认：已在 SPEC.md 写明「清洗只对原文做一次」。服务端要么直接对客户端上报的 `cleanText` 计算摘要，要么对原文重新清洗。
  - 待定：P1-CTR-01 确定 `CanonicalPost` 中上报的是原文还是清洗结果，需负责人确认。
- **R1 受保护路径**：`packages/canonical-spec/**` 需要负责人逐行审阅。
- **R2 格式不良的输入**：输入应当是合法的 Unicode 标量序列。TS 实现会先调用 `toWellFormed()`，把孤立代理替换为 U+FFFD；向量不覆盖孤立代理，因为 Swift 的 `String` 无法表示它。

## 交接记录（会话结束时填写）

**2026-11-26 · AC1–AC5 已完成；待负责人在 P1 人工检查点确认 Q1–Q7 后冻结 `schemaVersion = 1`**

- **AC1**：
  - 7 个向量文件共 51 条，每个文件 5–9 条。
  - `pnpm spec:vectors` 输出 `Tests 61 passed (61)`：51 条向量，加上向量集自检、`lp`、SHA-256、字段边界与非幂等等用例。
  - 同时输出 `expectedHash：51 条，不一致 0 条`。
- **AC2**：
  - `expectedClean` 都是人工写出的。生成脚本只负责组装 JSON，并断言转义前后内容一致。
  - `expectedHash` 由 `scripts/expected_hash.py`（只用 Python 标准库）根据 `expectedClean` 计算。回写前校验得到「不一致 51 条」，回写后得到「不一致 0 条」。
  - `lp` 的字节布局用手算的十六进制断言（`""`、`"ab"`、`"你"`、`👍`）；SHA-256 用标准测试值 `"abc"`。
- **AC3**：SPEC.md 对每一步都列出码位区段，不依赖 Unicode Script 属性。emoji 判定使用两侧都有的 `Emoji` 属性，并说明了 Unicode 版本差异带来的风险。
- **AC4**：`pnpm verify`、`pnpm knip`、全部 `check:*` 都通过，CI 结果见 PR。
- **AC5**：SPEC.md 的状态为「草案，待负责人确认」。
- **测试中发现 Q7**：清洗不是幂等的。已写入 SPEC.md，同时影响 P1-CTR-01（`CanonicalPost` 中上报原文还是清洗结果）。
- **顺带修复（在 `feat/p0-repo-04`，即 PR #8）**：P0-REPO-04 的 hooks 测试调用了 `locale`，knip 把它报为「未声明的二进制」。原因是我当时只跑了 verify，而 CI 不跑 knip。已在 knip 配置中忽略 `locale`，并把 `pnpm knip` 加入 CI。
- **文档同步**：00 §3.2 改为指向 SPEC.md（00 升到 v1.5）。
- **下一步**：P1-CTR-01（`packages/contracts`：基础枚举、`CanonicalPost`、错误码、problem+json）。
