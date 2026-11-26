#!/usr/bin/env bash
# PostToolUse（Edit|Write|MultiEdit）：改动受保护路径时记录到 .claude/state/protected-touched.txt，
# 并以退出码 2 提醒助手在 PR 中标注（PostToolUse 的退出码 2 不阻止工具，只把 stderr 交给助手）。
# 受保护路径的唯一来源是 .github/CODEOWNERS（由 pnpm check:codeowners 与 playbook §9.4 对齐），另加 05 §6.6 的 config/**。
set -uo pipefail
source "$(dirname "$0")/lib.sh"
command -v jq >/dev/null 2>&1 || exit 0

file=$(jq -r '.tool_input.file_path // empty' 2>/dev/null) || exit 0
[ -z "${file}" ] && exit 0
rel=$(rel_path "${file}")
[ -z "${rel}" ] && exit 0

codeowners="${CLAUDE_PROJECT_DIR}/.github/CODEOWNERS"
patterns=("config/*")
if [ -f "${codeowners}" ]; then
  while read -r pattern _; do
    case "${pattern}" in ''|\#*) continue ;; esac
    pattern=${pattern#/}
    pattern=${pattern//\*\*\//*}   # "**/" → "*"（bash 的 * 可跨目录）
    pattern=${pattern//\*\*/*}
    patterns+=("${pattern}")
  done < "${codeowners}"
fi

for pattern in "${patterns[@]}"; do
  # shellcheck disable=SC2053
  if [[ "${rel}" == ${pattern} ]]; then
    state="${CLAUDE_PROJECT_DIR}/.claude/state"
    mkdir -p "${state}"
    grep -qxF "${rel}" "${state}/protected-touched.txt" 2>/dev/null || printf '%s\n' "${rel}" >> "${state}/protected-touched.txt"
    echo "提示：${rel} 属于受保护路径（匹配 ${pattern}），PR 描述的「需负责人关注」中必须列出，并由负责人审阅（playbook §9.4）。" >&2
    exit 2
  fi
done
exit 0
