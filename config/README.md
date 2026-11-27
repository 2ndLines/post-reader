# config

配置即代码（00 §5）。已有 schema 的文件由 `packages/config-schema` 校验，`pnpm check:config` 在 CI 中运行。

- 未标定的参数写成 `{ uncalibrated: true, source: "<标定依据>" }`，不写 0、不写猜测值。`pnpm check:config` 会列出它们；`pnpm check:config --production` 在仍有未标定值时失败，生产环境不得加载。
- `tiers.yaml`、`quotas.yaml`、`prompts/**`、`schemas/**`、`allowlist.yaml` 是受保护路径（playbook §9.4），改动需负责人审阅。
