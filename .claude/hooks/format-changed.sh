#!/usr/bin/env bash
# PostToolUse（Edit|Write|MultiEdit）：格式化刚改的文件。TS/JS/JSON 用 Biome，Swift 用 swiftformat（安装后才生效）。
# 格式化失败（多为语法错误）时以退出码 2 把错误摘要反馈给助手；工具已执行，不会被撤销。
set -uo pipefail
source "$(dirname "$0")/lib.sh"
command -v jq >/dev/null 2>&1 || exit 0

file=$(jq -r '.tool_input.file_path // empty' 2>/dev/null) || exit 0
[ -z "${file}" ] && exit 0
rel=$(rel_path "${file}")
[ -z "${rel}" ] && exit 0
[ -f "${CLAUDE_PROJECT_DIR}/${rel}" ] || exit 0

case "${rel}" in
  *.ts|*.tsx|*.mts|*.cts|*.js|*.mjs|*.cjs|*.json|*.jsonc)
    if ! out=$(cd "${CLAUDE_PROJECT_DIR}" && repo_exec pnpm exec biome format --write --no-errors-on-unmatched "${rel}" 2>&1); then
      echo "Biome 无法格式化 ${rel}：" >&2
      printf '%s\n' "${out}" | tail -n 20 >&2
      exit 2
    fi ;;
  *.swift)
    if command -v swiftformat >/dev/null 2>&1; then
      swiftformat --quiet "${CLAUDE_PROJECT_DIR}/${rel}" || { echo "swiftformat 无法格式化 ${rel}" >&2; exit 2; }
    fi ;;
esac
exit 0
