/**
 * V1：Node 26 下 BullMQ、Testcontainers、drizzle-kit、promptfoo、Pulumi CLI 是否可用（05 §1.2；任务卡 P0-REPO-05）。
 * 前提：`pnpm dev` 已拉起本地依赖；Docker 可用；在 mise 环境中运行（pulumi 由 mise 提供）。
 * 所有临时文件写入系统临时目录，不写 ~/.pulumi、~/.promptfoo。
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import postgres from 'postgres';
import { GenericContainer, Wait } from 'testcontainers';
import { composeImage, type Result, redisPing, repoRoot, run, summarize } from './lib.ts';

const verifyRoot = resolve(import.meta.dirname, '..');
const bin = (name: string) => join(verifyRoot, 'node_modules', '.bin', name);
const scratch = mkdtempSync(join(tmpdir(), 'post-reader-v1-'));
const LOCAL_PG = 'postgres://reader:reader-local-only@127.0.0.1:5432';

async function bullmq(): Promise<string> {
  // BullMQ 6 起 ioredis 是可选 peer，原生 ESM 下必须传入已构造的客户端；Worker 需要专用连接（05 §4.2）
  const redis = () => new Redis({ host: '127.0.0.1', port: 6379, maxRetriesPerRequest: null });
  const queueConnection = redis();
  const workerConnection = redis();
  const name = `v1-probe-${Date.now()}`;
  const queue = new Queue(name, { connection: queueConnection });
  const worker = new Worker(name, async (job) => ({ echoed: job.data.value * 2 }), {
    connection: workerConnection,
  });
  try {
    const processed = new Promise<unknown>((resolveJob, reject) => {
      worker.on('completed', (_job, value) => resolveJob(value));
      worker.on('failed', (_job, error) => reject(error));
    });
    await queue.add('probe', { value: 21 }, { removeOnComplete: true });
    const value = await processed;
    if (JSON.stringify(value) !== '{"echoed":42}')
      throw new Error(`返回值异常：${JSON.stringify(value)}`);
    await queue.obliterate({ force: true });
    return `入队并消费 1 个任务，返回 ${JSON.stringify(value)}`;
  } finally {
    await worker.close();
    await queue.close();
    queueConnection.disconnect();
    workerConnection.disconnect();
  }
}

async function testcontainersProbe(): Promise<string> {
  const pgImage = composeImage('postgres');
  const valkeyImage = composeImage('valkey');
  const pg = await new GenericContainer(pgImage)
    .withEnvironment({
      POSTGRES_USER: 'probe',
      POSTGRES_PASSWORD: 'probe-local-only',
      POSTGRES_DB: 'probe',
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .start();
  const valkey = await new GenericContainer(valkeyImage)
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
    .start();
  try {
    const sql = postgres({
      host: pg.getHost(),
      port: pg.getMappedPort(5432),
      user: 'probe',
      password: 'probe-local-only',
      database: 'probe',
    });
    const [row] = await sql`select current_setting('server_version') as version`;
    await sql.end();
    const pong = await redisPing(valkey.getHost(), valkey.getMappedPort(6379));
    return `PostgreSQL ${row?.version}（${pgImage.split('@')[0]}）；Valkey PING → ${pong}`;
  } finally {
    await Promise.all([pg.stop(), valkey.stop()]);
  }
}

async function drizzleKit(): Promise<string> {
  const database = `v1_probe_${Date.now()}`;
  const admin = postgres(`${LOCAL_PG}/reader`);
  await admin.unsafe(`create database ${database}`);
  try {
    const dir = join(scratch, 'drizzle');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'schema.ts'), 'export {};\n');
    writeFileSync(
      join(dir, 'drizzle.config.ts'),
      [
        "import { defineConfig } from 'drizzle-kit';",
        'export default defineConfig({',
        "  dialect: 'postgresql',",
        `  schema: ${JSON.stringify(join(dir, 'schema.ts'))},`,
        `  out: ${JSON.stringify(join(dir, 'migrations'))},`,
        `  dbCredentials: { url: ${JSON.stringify(`${LOCAL_PG}/${database}`)} },`,
        '});',
        '',
      ].join('\n'),
    );
    const config = join(dir, 'drizzle.config.ts');
    run(
      bin('drizzle-kit'),
      ['generate', '--custom', '--name', 'v1_empty', '--config', config],
      verifyRoot,
    );
    const sqlFiles = readdirSync(join(dir, 'migrations')).filter((f) => f.endsWith('.sql'));
    if (sqlFiles.length !== 1) throw new Error(`期望生成 1 个迁移，实际 ${sqlFiles.length}`);
    run(bin('drizzle-kit'), ['migrate', '--config', config], verifyRoot);
    const db = postgres(`${LOCAL_PG}/${database}`);
    const applied = await db`select count(*)::int as n from drizzle.__drizzle_migrations`;
    await db.end();
    if (applied[0]?.n !== 1) throw new Error(`迁移记录数异常：${applied[0]?.n}`);
    return `generate 生成 ${sqlFiles[0]}；migrate 执行后 __drizzle_migrations 记录 1 条`;
  } finally {
    await admin.unsafe(`drop database if exists ${database} with (force)`);
    await admin.end();
  }
}

async function promptfooProbe(): Promise<string> {
  const dir = join(scratch, 'promptfoo');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'promptfooconfig.yaml'),
    [
      'description: V1 本地断言',
      'prompts: ["hello {{name}}"]',
      'providers: ["echo"]',
      'tests:',
      '  - vars: { name: world }',
      '    assert:',
      '      - { type: equals, value: "hello world" }',
      '',
    ].join('\n'),
  );
  const output = join(dir, 'result.json');
  run(
    bin('promptfoo'),
    [
      'eval',
      '-c',
      join(dir, 'promptfooconfig.yaml'),
      '--no-cache',
      '--no-share',
      '--no-table',
      '-o',
      output,
    ],
    dir,
    { PROMPTFOO_CONFIG_DIR: join(dir, 'home'), PROMPTFOO_DISABLE_UPDATE: 'true' },
  );
  const result = JSON.parse(readFileSync(output, 'utf8'));
  const stats = result.results?.stats ?? {};
  if (stats.successes !== 1 || stats.failures !== 0)
    throw new Error(`断言结果异常：${JSON.stringify(stats)}`);
  return `echo provider + equals 断言：successes=${stats.successes} failures=${stats.failures}`;
}

async function pulumiProbe(): Promise<string> {
  const dir = join(scratch, 'pulumi');
  mkdirSync(join(dir, 'state'), { recursive: true });
  writeFileSync(join(dir, 'Pulumi.yaml'), 'name: v1-probe\nruntime: yaml\nresources: {}\n');
  const env = {
    PULUMI_HOME: join(dir, 'home'),
    PULUMI_BACKEND_URL: `file://${join(dir, 'state')}`,
    PULUMI_CONFIG_PASSPHRASE: 'v1-local-only',
    PULUMI_SKIP_UPDATE_CHECK: 'true',
  };
  const version = run('pulumi', ['version'], dir, env).trim();
  run('pulumi', ['stack', 'init', 'v1', '--non-interactive'], dir, env);
  const preview = run('pulumi', ['preview', '--non-interactive', '--stack', 'v1'], dir, env);
  if (!/Resources:/.test(preview)) throw new Error(`preview 输出异常：${preview.slice(-300)}`);
  return `pulumi ${version}；本地 file 后端空 stack preview 成功`;
}

const results: Result[] = [];
console.log(
  `V1 · node ${process.version} · ${execFileSync('docker', ['--version'], { encoding: 'utf8' }).trim()}`,
);
for (const [name, probe] of [
  ['BullMQ', bullmq],
  ['Testcontainers', testcontainersProbe],
  ['drizzle-kit', drizzleKit],
  ['promptfoo', promptfooProbe],
  ['Pulumi CLI', pulumiProbe],
] as const) {
  const started = performance.now();
  try {
    results.push({ name, ok: true, detail: await probe(), ms: performance.now() - started });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, detail, ms: performance.now() - started });
  }
}
rmSync(scratch, { recursive: true, force: true });
process.exitCode = summarize('V1', results, repoRoot) ? 0 : 1;
