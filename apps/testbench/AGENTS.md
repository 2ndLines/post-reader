# apps/testbench · 测试台架规则

先读根目录 [AGENTS.md](../../AGENTS.md)；本文件只补充本端约定。
依据：架构 [04](../../docs/archs/04-testbench.md) §2、§12；playbook §8.4、§9.4。

## 命令
| 命令 | 状态 |
| --- | --- |
| `pnpm verify` | 可用（根目录） |
| `pnpm testbench run --suite pr --region intl` | P3-TB-01 起 |
| `smoke`、`release`、`nightly` 套件 | P3–P6 逐步加入，见 04 §9 |

## 结构
- `runner/`：Fastify API、BullMQ worker、CLI，以及 inspect、e2e-client、suite 三种运行模式
- `runner/src/gates/`：每个门禁一个文件；`runner/src/analyzers/`：响度、ASR 回识别、相邻音色等分析器
- `web/`：React + Ant Design 的台架界面
- 样本与门禁配置在仓库根目录的 `evals/`

## 规则
- 默认使用 Mock 厂商（回放模式）；需要真实厂商时，在套件中显式声明并显示预算，只在 `pr`、`release`、`nightly` 套件中开启
- 只读生产代码的公开导出（`@post-reader/server/pipeline`），不复制流水线逻辑
- 新增门禁时，同时新增一个「必定失败」的回归样本
- UI 只用 Ant Design、`packages/ui` 与本应用的 `components/`
- 样本只用合成数据或经确认的公开内容（playbook §10.2）

## 红线
- 不通过修改 `evals/fixtures/**/expected*`、`evals/gates.yaml` 的阈值或删除样本让门禁变绿
- 台架报告中不出现真实用户标识

## 受保护路径（必须负责人审阅，见 `.github/CODEOWNERS`）
- `evals/gates.yaml`、`evals/fixtures/**/expected*`
