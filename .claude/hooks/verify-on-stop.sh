#!/usr/bin/env bash
# Stop：对有未提交改动的 TS 包运行类型检查与单元测试；失败时以退出码 2 阻止结束并给出摘要。
# 本次结束已由 Stop hook 拦过一次（stop_hook_active 为 true）时直接放行，避免循环。
# iOS 检查较慢，不放在这里，由完成定义要求提交前运行 make -C apps/ios lint test（05 附录 E）。
set -uo pipefail
source "$(dirname "$0")/lib.sh"

input=$(cat)
if command -v jq >/dev/null 2>&1 && [ "$(printf '%s' "${input}" | jq -r '.stop_hook_active // false' 2>/dev/null)" = "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR}" || exit 0
changed=$( { git diff --name-only HEAD; git ls-files --others --exclude-standard; } 2>/dev/null )
[ -z "${changed}" ] && exit 0
printf '%s\n' "${changed}" | grep -qE '^(apps|packages|tools)/.*\.(ts|tsx|mts|cts|js|mjs|json)$' || exit 0

state="${CLAUDE_PROJECT_DIR}/.claude/state"
mkdir -p "${state}"
log="${state}/verify-on-stop.log"
if ! repo_exec pnpm exec turbo run typecheck test --filter='...[HEAD]' --output-logs=errors-only >"${log}" 2>&1; then
  echo "快速检查（变更包的 typecheck 与 test）未通过，请修复后再结束。完整日志：.claude/state/verify-on-stop.log；摘要：" >&2
  tail -n 40 "${log}" >&2
  exit 2
fi
exit 0
