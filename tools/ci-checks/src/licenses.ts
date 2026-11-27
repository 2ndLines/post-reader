/**
 * 许可证检查（05 §2.2）。输入为 `pnpm -r licenses list --json` 的输出：以许可证表达式为键、包列表为值。
 * 许可证表达式按 SPDX 语法求值：OR 取最宽松的一项，AND 取最严格的一项，WITH 例外按基础许可证计。
 */

export interface LicensePolicy {
  allowed: string[];
  conditional: Record<string, string>;
  exceptions: LicenseException[];
}

interface LicenseException {
  name: string;
  license: string;
  reason: string;
}

interface PackageLicense {
  name: string;
  versions: string[];
  license: string;
}

export type LicenseReport = Record<string, PackageLicense[]>;

interface LicenseFinding {
  name: string;
  versions: string[];
  license: string;
  detail: string;
}

export interface LicenseEvaluation {
  violations: LicenseFinding[];
  notices: LicenseFinding[];
}

type Verdict = 'allowed' | 'conditional' | 'denied';

const RANK: Record<Verdict, number> = { denied: 0, conditional: 1, allowed: 2 };

function best(a: Verdict, b: Verdict): Verdict {
  return RANK[a] >= RANK[b] ? a : b;
}

function worst(a: Verdict, b: Verdict): Verdict {
  return RANK[a] <= RANK[b] ? a : b;
}

function tokenize(expression: string): string[] {
  return expression
    .replace(/[()]/g, (paren) => ` ${paren} `)
    .split(/\s+/)
    .filter(Boolean);
}

/** 对 SPDX 表达式求值；无法解析时返回 null（按禁止处理） */
export function classifyLicense(expression: string, policy: LicensePolicy): Verdict | null {
  const tokens = tokenize(expression);
  let position = 0;

  const classifyId = (id: string): Verdict => {
    const normalized = id.endsWith('+') ? id.slice(0, -1) : id;
    if (policy.allowed.includes(normalized)) return 'allowed';
    if (Object.hasOwn(policy.conditional, normalized)) return 'conditional';
    return 'denied';
  };

  const parsePrimary = (): Verdict | null => {
    const token = tokens[position];
    if (token === undefined) return null;
    position += 1;
    if (token === '(') {
      const inner = parseOr();
      if (inner === null || tokens[position] !== ')') return null;
      position += 1;
      return inner;
    }
    if (token === ')' || token === 'AND' || token === 'OR' || token === 'WITH') return null;
    const verdict = classifyId(token);
    if (tokens[position] === 'WITH') {
      position += 1;
      if (tokens[position] === undefined) return null;
      position += 1;
    }
    return verdict;
  };

  const parseAnd = (): Verdict | null => {
    let left = parsePrimary();
    while (left !== null && tokens[position] === 'AND') {
      position += 1;
      const right = parsePrimary();
      if (right === null) return null;
      left = worst(left, right);
    }
    return left;
  };

  const parseOr = (): Verdict | null => {
    let left = parseAnd();
    while (left !== null && tokens[position] === 'OR') {
      position += 1;
      const right = parseAnd();
      if (right === null) return null;
      left = best(left, right);
    }
    return left;
  };

  const result = parseOr();
  return result !== null && position === tokens.length ? result : null;
}

export function evaluateLicenses(report: LicenseReport, policy: LicensePolicy): LicenseEvaluation {
  const violations: LicenseFinding[] = [];
  const notices: LicenseFinding[] = [];

  for (const [expression, packages] of Object.entries(report)) {
    for (const pkg of packages) {
      const license = pkg.license || expression;
      const base = { name: pkg.name, versions: pkg.versions, license };
      const exception = policy.exceptions.find(
        (entry) => entry.name === pkg.name && entry.license === license,
      );
      if (exception) {
        notices.push({ ...base, detail: `例外放行：${exception.reason}` });
        continue;
      }
      const verdict = classifyLicense(license, policy);
      if (verdict === 'allowed') continue;
      if (verdict === 'conditional') {
        const conditions = tokenize(license)
          .map((id) => policy.conditional[id])
          .filter((text): text is string => text !== undefined);
        notices.push({ ...base, detail: `有条件允许：${[...new Set(conditions)].join('；')}` });
        continue;
      }
      violations.push({
        ...base,
        detail: verdict === null ? '许可证表达式无法解析' : '不在允许清单中',
      });
    }
  }

  const byName = (a: LicenseFinding, b: LicenseFinding) => a.name.localeCompare(b.name);
  return { violations: violations.sort(byName), notices: notices.sort(byName) };
}
