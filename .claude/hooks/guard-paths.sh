#!/usr/bin/env bash
# PreToolUse（Edit|Write|MultiEdit|NotebookEdit）：命中硬性拒绝列表时以退出码 2 阻止写入，stderr 反馈给助手。
# 列表来源：05 §6.6。护栏本身（settings.json、hooks、CODEOWNERS）也在列表中，只能由负责人修改。
# 无法解析输入时一律拒绝（失败即关闭）。
set -uo pipefail
# 失败即关闭：脚本内部出错（退出码既不是 0 也不是 2）时一律改为 2，阻止写入
trap 'rc=$?; if [ "${rc}" -ne 0 ] && [ "${rc}" -ne 2 ]; then echo "guard-paths：内部错误（退出码 ${rc}），已拒绝写入。" >&2; exit 2; fi' EXIT
source "$(dirname "$0")/lib.sh" || { echo "guard-paths：无法加载 lib.sh，已拒绝写入。" >&2; exit 2; }

if ! command -v jq >/dev/null 2>&1; then
  echo "guard-paths：缺少 jq，无法判断写入目标，已拒绝。请安装 jq。" >&2
  exit 2
fi
input=$(cat)
file=$(printf '%s' "${input}" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' 2>/dev/null) || {
  echo "guard-paths：无法解析 hook 输入，已拒绝。" >&2
  exit 2
}
[ -z "${file}" ] && exit 0

case "${file}" in
  */../*|../*|*/..)
    echo "guard-paths：路径含 ..，已拒绝：${file}" >&2
    exit 2 ;;
esac

rel=$(rel_path "${file}")
[ -z "${rel}" ] && exit 0

name=${rel##*/}
case "${name}" in
  .env|.env.*|*.p8|*.pem|*.key)
    echo "拒绝写入密钥或环境文件：${rel}。密钥只在各云凭据服务中，由负责人管理（playbook §1.3、§10）。" >&2
    exit 2 ;;
esac

case "${rel}" in
  infra/*Pulumi.*prod*.yaml|.github/workflows/deploy-prod*|.claude/settings.json|.claude/hooks/*|CODEOWNERS|.github/CODEOWNERS)
    echo "拒绝写入受保护文件：${rel}。此类文件只能由负责人修改；如确需变更，请在任务卡中说明并停下等待（05 §6.6）。" >&2
    exit 2 ;;
esac
exit 0
