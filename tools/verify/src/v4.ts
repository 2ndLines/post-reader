/**
 * V4：本地 S3 替身（SeaweedFS）的预签名 GET/PUT、分段上传、DeleteObjects 行为（05 §1.2；任务卡 P0-REPO-05）。
 * 前提：`pnpm dev` 已拉起本地依赖（账号见 env.example）。
 * 每一项记录 SeaweedFS 的实际行为与 AWS S3 文档行为是否一致；核心操作失败时退出码为 1，行为差异只记录不判失败。
 */
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const bucket = 'reader-audio-private';
const prefix = `v4-probe/${Date.now()}`;
const clientConfig = {
  endpoint: 'http://127.0.0.1:8333',
  region: 'us-east-1',
  forcePathStyle: true,
  credentials: { accessKeyId: 'reader-local-access', secretAccessKey: 'reader-local-only-secret' },
};
const s3 = new S3Client(clientConfig);
// 签发预签名 PUT 必须用 WHEN_REQUIRED：SDK 默认（WHEN_SUPPORTED）会把签发时空内容的 CRC32 写进 URL，
// 上传真实内容时校验和不符被拒（BadDigest）。这是 SDK 行为，AWS S3 同样会拒绝；platform/storage 必须遵守。
const presigner = new S3Client({ ...clientConfig, requestChecksumCalculation: 'WHEN_REQUIRED' });

interface Check {
  group: '预签名' | '分段上传' | 'DeleteObjects' | 'SDK 默认行为';
  name: string;
  core: boolean;
  s3Expected: string;
  observed: string;
  matches: boolean;
}

const checks: Check[] = [];
const errorName = (error: unknown) => (error as { name?: string }).name ?? String(error);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MiB = 1024 * 1024;

async function presigned(): Promise<void> {
  const key = `${prefix}/presigned.m4a`;
  const body = new TextEncoder().encode('v4 presigned body');
  const putUrl = await getSignedUrl(
    presigner,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: 'audio/mp4' }),
    { expiresIn: 60 },
  );
  const put = await fetch(putUrl, {
    method: 'PUT',
    body,
    headers: { 'content-type': 'audio/mp4' },
  });
  checks.push({
    group: '预签名',
    name: '预签名 PUT 上传',
    core: true,
    s3Expected: '200',
    observed: String(put.status),
    matches: put.status === 200,
  });

  const defaultUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: bucket, Key: `${key}.default` }),
    {
      expiresIn: 60,
    },
  );
  const defaultPut = await fetch(defaultUrl, { method: 'PUT', body });
  const defaultBody = await defaultPut.text();
  checks.push({
    group: 'SDK 默认行为',
    name: 'SDK 默认设置签发的预签名 PUT（URL 内含空内容的 CRC32）',
    core: false,
    s3Expected: '拒绝（S3 校验 x-amz-checksum-crc32；应改用 WHEN_REQUIRED 签发）',
    observed: `${defaultPut.status} ${/<Code>(\w+)<\/Code>/.exec(defaultBody)?.[1] ?? ''}`.trim(),
    matches: defaultPut.status === 400,
  });

  const getUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: 60,
  });
  const get = await fetch(getUrl);
  const text = await get.text();
  checks.push({
    group: '预签名',
    name: '预签名 GET 读取并比对内容与 Content-Type',
    core: true,
    s3Expected: '200，内容一致，Content-Type 为上传时的值',
    observed: `${get.status}，内容${text === 'v4 presigned body' ? '一致' : '不一致'}，Content-Type=${get.headers.get('content-type')}`,
    matches:
      get.status === 200 &&
      text === 'v4 presigned body' &&
      get.headers.get('content-type') === 'audio/mp4',
  });

  const tampered = new URL(getUrl);
  const signature = tampered.searchParams.get('X-Amz-Signature') ?? '';
  tampered.searchParams.set(
    'X-Amz-Signature',
    `${signature.slice(0, -1)}${signature.endsWith('0') ? '1' : '0'}`,
  );
  const bad = await fetch(tampered);
  await bad.arrayBuffer();
  checks.push({
    group: '预签名',
    name: '篡改签名后访问',
    core: true,
    s3Expected: '403 SignatureDoesNotMatch',
    observed: String(bad.status),
    matches: bad.status === 403,
  });

  const shortUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: 1,
  });
  await sleep(2500);
  const expired = await fetch(shortUrl);
  await expired.arrayBuffer();
  checks.push({
    group: '预签名',
    name: '过期后访问（有效期 1 s，2.5 s 后请求）',
    core: true,
    s3Expected: '403 AccessDenied（Request has expired）',
    observed: String(expired.status),
    matches: expired.status === 403,
  });

  const tooLong = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: 8 * 24 * 3600,
  }).then(
    () => 'SDK 允许签发',
    (error) => `SDK 拒绝签发：${errorName(error)}`,
  );
  checks.push({
    group: '预签名',
    name: '签发超过 7 天有效期的链接',
    core: false,
    s3Expected: 'SigV4 上限 7 天，SDK 在签发时拒绝',
    observed: tooLong,
    matches: tooLong.startsWith('SDK 拒绝'),
  });
}

async function multipart(): Promise<void> {
  const key = `${prefix}/multipart.bin`;
  const { UploadId } = await s3.send(
    new CreateMultipartUploadCommand({ Bucket: bucket, Key: key }),
  );
  const part1 = await s3.send(
    new UploadPartCommand({
      Bucket: bucket,
      Key: key,
      UploadId,
      PartNumber: 1,
      Body: new Uint8Array(5 * MiB).fill(1),
    }),
  );
  const part2 = await s3.send(
    new UploadPartCommand({
      Bucket: bucket,
      Key: key,
      UploadId,
      PartNumber: 2,
      Body: new Uint8Array(1024).fill(2),
    }),
  );
  const done = await s3.send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId,
      MultipartUpload: {
        Parts: [
          { PartNumber: 1, ETag: part1.ETag },
          { PartNumber: 2, ETag: part2.ETag },
        ],
      },
    }),
  );
  const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  checks.push({
    group: '分段上传',
    name: '5 MiB + 1 KiB 两段上传并合并',
    core: true,
    s3Expected: `合并成功，大小 ${5 * MiB + 1024}`,
    observed: `合并${done.ETag ? '成功' : '无 ETag'}，大小 ${head.ContentLength}`,
    matches: head.ContentLength === 5 * MiB + 1024,
  });
  checks.push({
    group: '分段上传',
    name: '合并后 ETag 形如 "<md5>-<段数>"',
    core: false,
    s3Expected: '"…-2"',
    observed: String(head.ETag),
    matches: /-2"?$/.test(String(head.ETag)),
  });

  const smallKey = `${prefix}/too-small.bin`;
  const small = await s3.send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: smallKey }));
  const s1 = await s3.send(
    new UploadPartCommand({
      Bucket: bucket,
      Key: smallKey,
      UploadId: small.UploadId,
      PartNumber: 1,
      Body: new Uint8Array(1024),
    }),
  );
  const s2 = await s3.send(
    new UploadPartCommand({
      Bucket: bucket,
      Key: smallKey,
      UploadId: small.UploadId,
      PartNumber: 2,
      Body: new Uint8Array(1024),
    }),
  );
  const smallResult = await s3
    .send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: smallKey,
        UploadId: small.UploadId,
        MultipartUpload: {
          Parts: [
            { PartNumber: 1, ETag: s1.ETag },
            { PartNumber: 2, ETag: s2.ETag },
          ],
        },
      }),
    )
    .then(
      () => '合并成功',
      (error) => `拒绝：${errorName(error)}`,
    );
  checks.push({
    group: '分段上传',
    name: '非末段小于 5 MiB 时合并',
    core: false,
    s3Expected: '拒绝：EntityTooSmall（OSS 下限为 100 KB）',
    observed: smallResult,
    matches: smallResult.includes('EntityTooSmall'),
  });

  const abortKey = `${prefix}/aborted.bin`;
  const aborted = await s3.send(
    new CreateMultipartUploadCommand({ Bucket: bucket, Key: abortKey }),
  );
  await s3.send(
    new UploadPartCommand({
      Bucket: bucket,
      Key: abortKey,
      UploadId: aborted.UploadId,
      PartNumber: 1,
      Body: new Uint8Array(1024),
    }),
  );
  await s3.send(
    new AbortMultipartUploadCommand({ Bucket: bucket, Key: abortKey, UploadId: aborted.UploadId }),
  );
  const afterAbort = await s3
    .send(new ListPartsCommand({ Bucket: bucket, Key: abortKey, UploadId: aborted.UploadId }))
    .then(
      (r) => `仍可列出 ${r.Parts?.length ?? 0} 段`,
      (error) => `拒绝：${errorName(error)}`,
    );
  checks.push({
    group: '分段上传',
    name: '取消后再列出分段',
    core: true,
    s3Expected: '拒绝：NoSuchUpload',
    observed: afterAbort,
    matches: afterAbort.includes('NoSuchUpload'),
  });
}

async function deleteObjects(): Promise<void> {
  const keys = ['a', 'b', 'c'].map((k) => `${prefix}/del-${k}`);
  for (const Key of keys) await s3.send(new PutObjectCommand({ Bucket: bucket, Key, Body: 'x' }));
  const missing = `${prefix}/never-existed`;
  const result = await s3.send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: [...keys, missing].map((Key) => ({ Key })) },
    }),
  );
  const remaining = await Promise.all(
    keys.map((Key) =>
      s3.send(new HeadObjectCommand({ Bucket: bucket, Key })).then(
        () => 'exists',
        () => 'gone',
      ),
    ),
  );
  checks.push({
    group: 'DeleteObjects',
    name: '批量删除 3 个已存在对象',
    core: true,
    s3Expected: '3 个对象都被删除',
    observed: `删除后状态：${remaining.join(',')}`,
    matches: remaining.every((r) => r === 'gone'),
  });
  const reportedMissing = result.Deleted?.some((d) => d.Key === missing) ?? false;
  checks.push({
    group: 'DeleteObjects',
    name: '不存在的键也列入 Deleted',
    core: false,
    s3Expected: '是（S3 对不存在的键也报告删除成功）',
    observed: `Deleted ${result.Deleted?.length ?? 0} 项，Errors ${result.Errors?.length ?? 0} 项，含不存在的键：${reportedMissing ? '是' : '否'}`,
    matches: reportedMissing && (result.Errors?.length ?? 0) === 0,
  });

  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: keys[0], Body: 'x' }));
  const quiet = await s3.send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Quiet: true, Objects: [{ Key: keys[0] }] },
    }),
  );
  checks.push({
    group: 'DeleteObjects',
    name: 'Quiet 模式',
    core: false,
    s3Expected: '只返回出错的键，Deleted 为空',
    observed: `Deleted ${quiet.Deleted?.length ?? 0} 项`,
    matches: (quiet.Deleted?.length ?? 0) === 0,
  });

  const tooMany = await s3
    .send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: Array.from({ length: 1001 }, (_, i) => ({ Key: `${prefix}/bulk-${i}` })),
        },
      }),
    )
    .then(
      (r) => `接受（Deleted ${r.Deleted?.length ?? 0}）`,
      (error) => `拒绝：${errorName(error)}`,
    );
  checks.push({
    group: 'DeleteObjects',
    name: '单次 1001 个键',
    core: false,
    s3Expected: '拒绝：MalformedXML（单次上限 1000，OSS 同为 1000）',
    observed: tooMany,
    matches: tooMany.startsWith('拒绝'),
  });
}

async function sdkDefaults(): Promise<void> {
  // SDK v3 近年默认对上传计算并发送 CRC32 校验和（requestChecksumCalculation: WHEN_SUPPORTED）
  const key = `${prefix}/checksum.txt`;
  const result = await s3
    .send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: 'checksum probe' }))
    .then(
      () => '接受',
      (error) => `拒绝：${errorName(error)}`,
    );
  checks.push({
    group: 'SDK 默认行为',
    name: 'SDK 默认附带 CRC32 校验和的 PutObject',
    core: true,
    s3Expected: '接受',
    observed: result,
    matches: result === '接受',
  });
}

for (const step of [presigned, multipart, deleteObjects, sdkDefaults]) {
  try {
    await step();
  } catch (error) {
    checks.push({
      group: 'SDK 默认行为',
      name: `${step.name} 意外失败`,
      core: true,
      s3Expected: '—',
      observed: `${errorName(error)}: ${(error as Error).message}`,
      matches: false,
    });
  }
}

for (const c of checks) {
  const mark = c.matches ? '一致' : c.core ? 'FAIL' : '差异';
  console.log(
    `${mark}  [${c.group}] ${c.name}\n      S3：${c.s3Expected}\n      实测：${c.observed}`,
  );
}
const coreFailures = checks.filter((c) => c.core && !c.matches).length;
const differences = checks.filter((c) => !c.core && !c.matches).length;
console.log(`V4：${checks.length} 项，核心失败 ${coreFailures}，行为差异 ${differences}`);
process.exitCode = coreFailures > 0 ? 1 : 0;
