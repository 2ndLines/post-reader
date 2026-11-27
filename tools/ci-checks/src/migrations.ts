/**
 * 已发布迁移不得修改（02 §17 第 5 条）：base 分支中已有的迁移文件，在当前提交中必须原样存在。
 * 新增迁移不受限制；修改或删除已发布的迁移视为违规（应改为新增一个迁移，遵守先扩后缩）。
 */
export interface MigrationFile {
  path: string;
  content: string;
}

export function findChangedPublishedMigrations(
  published: MigrationFile[],
  current: Map<string, string>,
): { path: string; reason: string }[] {
  return published.flatMap(({ path, content }) => {
    const now = current.get(path);
    if (now === undefined) return [{ path, reason: '已发布的迁移被删除' }];
    if (now !== content) return [{ path, reason: '已发布的迁移被修改' }];
    return [];
  });
}
