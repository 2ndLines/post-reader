import { findUnpinnedActions } from '../action-pins.ts';
import { readWorkflows } from './repo.ts';

const workflows = readWorkflows();
const violations = workflows.flatMap(({ file, content }) => findUnpinnedActions(file, content));
for (const v of violations) {
  console.error(`${v.file}:${v.line}  ${v.uses}  ${v.reason}`);
}
console.log(`Action 固定检查：${workflows.length} 个工作流，违规 ${violations.length}`);
process.exitCode = violations.length > 0 ? 1 : 0;
