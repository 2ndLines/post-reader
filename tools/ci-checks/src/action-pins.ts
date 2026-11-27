/**
 * 工作流中每个 `uses:` 必须按完整 commit SHA 固定，并在注释中写版本号（05 §2.4、§5.3 规则 1）。
 * 仓库内本地 Action（`./`）不受此限；`docker://` 镜像必须按 digest 固定。
 */

export interface PinViolation {
  file: string;
  line: number;
  uses: string;
  reason: string;
}

const USES_LINE = /^\s*(?:-\s*)?uses:\s*(["']?)([^"'\s#]+)\1\s*(?:#\s*(\S+))?/;
const PINNED_ACTION = /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/;
const VERSION_COMMENT = /^v?\d+(?:\.\d+){0,2}$/;

export function findUnpinnedActions(file: string, content: string): PinViolation[] {
  const violations: PinViolation[] = [];
  content.split('\n').forEach((text, index) => {
    const match = USES_LINE.exec(text);
    if (!match) return;
    const uses = match[2] ?? '';
    const comment = match[3];
    const at = { file, line: index + 1, uses };
    if (uses.startsWith('./')) return;
    if (uses.startsWith('docker://')) {
      if (!/@sha256:[0-9a-f]{64}$/.test(uses)) {
        violations.push({ ...at, reason: 'docker 镜像未按 digest 固定' });
      }
      return;
    }
    if (!PINNED_ACTION.test(uses)) {
      violations.push({ ...at, reason: '未按 40 位 commit SHA 固定' });
      return;
    }
    if (comment === undefined || !VERSION_COMMENT.test(comment)) {
      violations.push({ ...at, reason: '缺少版本号注释（例如 `# v4.2.1`）' });
    }
  });
  return violations;
}
