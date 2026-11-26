#!/usr/bin/env bash
# hooks 共用函数。hooks 从 stdin 读取 Claude Code 传入的 JSON（tool_input.file_path 等），依赖 jq。

# 把绝对路径转换为相对项目根目录的路径；不在项目内时输出空串
rel_path() {
  local file="$1" root="${CLAUDE_PROJECT_DIR:-${PWD}}"
  case "${file}" in
    "${root}"/*) printf '%s' "${file#"${root}"/}" ;;
    /*) printf '' ;;
    *) printf '%s' "${file#./}" ;;
  esac
}

# 运行仓库工具：有 mise 时经 mise（版本与 .mise.toml 一致），否则直接运行
repo_exec() {
  if command -v mise >/dev/null 2>&1; then mise exec -C "${CLAUDE_PROJECT_DIR:-${PWD}}" -- "$@"; else "$@"; fi
}
