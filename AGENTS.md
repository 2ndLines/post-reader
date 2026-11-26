# Post&Comments Reader

把社交平台帖子与评论编排为多人播报音频的 iOS App。仓库包含 iOS 客户端、后端、管理后台、测试台架。
国内与海外两套独立部署，数据不互通。

## 先读
- 交接摘要：docs/progress/HANDOFF.md（设计阶段的结论、原则与待办，新会话必读）
- 工作方法：docs/archs/ai-dev-playbook.md（第 3 节工作循环、第 9 节完成定义）
- 架构：docs/archs/00-overview.md，再按任务读 01–05（05 为依赖登记）
- 需求：docs/prds/（主 PRD v2.7 草案、iOS / 管理后台 / 测试台架 PRD v1.3）；业务闭环评审在 docs/archs/prd-closure-review.md
- 技术选型与完整架构：docs/archs/技术选型分析.md、docs/archs/完整技术架构.md（在线文档导出副本）
- 决策：docs/adr/（0001–0016；晚于架构文档的 ADR 优先）
- 进度：docs/progress/STATUS.md

## 目录
apps/ios  apps/server  apps/admin-web  apps/testbench  apps/edge
packages/contracts  packages/canonical-spec  packages/ui  packages/config-schema  packages/signed-url
config/（配置即代码）  evals/（样本与门禁）  infra/（Pulumi）  docs/

## 命令
pnpm verify              # lint + typecheck + 单元测试（宣称完成前必须通过）
pnpm test:int            # 集成测试
pnpm contracts:gen       # 生成 openapi.yaml
pnpm spec:vectors        # 黄金向量
pnpm db:migrate:new X    # 生成迁移
make -C apps/ios project && make -C apps/ios lint test
pnpm testbench run --suite pr --region intl

## 红线
- 不记录或外发：帖子正文、评论、译文、URL、Cookie、邮箱、用户 ID 与内容的关联
- 不把用户 ID 发给外部厂商；不调用厂商批处理或文件接口
- 不弱化：证书固定、请求签名、设备证明（App Attest 等）、摘要校验、日志脱敏、权限矩阵
- 不在 App Group 存凭证；帖子卡片不显示任何计数
- 不修改门禁阈值与期望结果；不引入分析 SDK；新依赖先写 ADR
- 不推送 main、不合并自己的 PR、不跳过测试或钩子

## 设计原则（负责人确定）
- 杜绝临时方案与「以后再换」：技术链路、协议、数据模型、存储、部署按长期业务形态一次选对；功能范围可分期，扩展点从第一版预留。
- 待确认事项未决前一律按各表「未决前的默认」实现，默认值写入配置，不在代码中写死（ADR 0004）。
- 主体后端 Fastify；海外边缘层 Hono + Cloudflare Workers；边缘不承载业务逻辑与状态（ADR 0006）。
- 文档以本仓库 Markdown 为准；在线文档《技术选型分析》不再作为主版本维护。

## 完成定义
测试先行 → 相关检查全绿 → 文档同步 → 自审清单 → PR 附证据 → 更新 STATUS.md
