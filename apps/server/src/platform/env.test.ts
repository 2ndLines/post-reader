import { describe, expect, it } from 'vitest';
import { EnvError, parseEnv } from './env.ts';

const base = {
  ROLES: 'bff,orchestrator',
  REGION: 'intl',
  DATABASE_URL: 'postgres://reader:reader-local-only@127.0.0.1:5432/reader',
  REDIS_URL: 'redis://127.0.0.1:6379',
};

describe('parseEnv（02 §3.3）', () => {
  it('合法输入：角色拆分、缺省值生效', () => {
    const env = parseEnv(base);
    expect(env.ROLES).toEqual(['bff', 'orchestrator']);
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 8080,
      LOG_LEVEL: 'info',
      DATABASE_ROLE: 'app_rw',
    });
  });

  it.each([
    ['未知角色', { ROLES: 'bff,worker' }, 'ROLES'],
    ['重复角色', { ROLES: 'bff,bff' }, 'ROLES'],
    ['未知区域', { REGION: 'eu' }, 'REGION'],
    ['端口为负数', { PORT: '-1' }, 'PORT'],
    ['端口越界', { PORT: '70000' }, 'PORT'],
  ])('拒绝：%s', (_n, override, name) => {
    expect(() => parseEnv({ ...base, ...override })).toThrow(new RegExp(`${name} 不合法`));
  });

  it('缺失的变量报告为「缺失」', () => {
    const { DATABASE_URL: _omit, ...rest } = base;
    expect(() => parseEnv(rest)).toThrow('DATABASE_URL 缺失');
  });

  it('错误信息不回显变量值（可能是凭据）', () => {
    try {
      parseEnv({ ...base, DATABASE_URL: 'not a url but contains s3cr3t-password' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EnvError);
      expect((error as Error).message).toContain('DATABASE_URL 不合法');
      expect((error as Error).message).not.toContain('s3cr3t');
    }
  });
});
