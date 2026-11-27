/**
 * 测试专用：用 openssl 生成与 App Attest 结构相同的合成证书链（根 P-384 → 中间 P-384 → 叶 P-256），
 * 叶证书带 1.2.840.113635.100.8.2 nonce 扩展；用于覆盖 attest.ts 的全部校验分支。
 * Apple 没有公开可直接使用的完整样例证明对象，第三方的真机数据来源不可控，因此不用；生产使用固定的 Apple 根证书。
 * openssl 在 macOS 与 GitHub 的 Ubuntu 运行器上都自带，不新增依赖。
 */
import { execFileSync } from 'node:child_process';
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  type KeyObject,
  sign,
  X509Certificate,
} from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encode } from 'cbor-x';

const sha256 = (...parts: Uint8Array[]) => {
  const h = createHash('sha256');
  for (const p of parts) h.update(p);
  return h.digest();
};

function openssl(dir: string, ...args: string[]) {
  execFileSync('openssl', args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
}

export interface FixtureOptions {
  teamId: string;
  bundleId: string;
  challenge: string;
  environment: 'production' | 'development';
  /** 以下用于构造反例 */
  rpId?: string;
  counter?: number;
  aaguid?: Buffer;
  nonceChallenge?: string;
}

export interface AttestFixture {
  attestation: string;
  keyId: string;
  rootCertificatePem: string;
  leafValidTo: Date;
  makeAssertion(clientData: Uint8Array, counter: number, key?: KeyObject, rpId?: string): string;
  otherRootPem: string;
}

function selfSignedRoot(dir: string, name: string) {
  openssl(
    dir,
    'genpkey',
    '-algorithm',
    'EC',
    '-pkeyopt',
    'ec_paramgen_curve:P-384',
    '-out',
    `${name}.key`,
  );
  openssl(
    dir,
    'req',
    '-x509',
    '-new',
    '-key',
    `${name}.key`,
    '-subj',
    `/CN=${name}`,
    '-days',
    '3650',
    '-out',
    `${name}.pem`,
    '-addext',
    'basicConstraints=critical,CA:true',
    '-addext',
    'keyUsage=critical,keyCertSign,cRLSign',
  );
}

export function makeAttestFixture(options: FixtureOptions): AttestFixture {
  const dir = mkdtempSync(join(tmpdir(), 'attest-'));
  selfSignedRoot(dir, 'root');
  selfSignedRoot(dir, 'attacker-root');

  openssl(
    dir,
    'genpkey',
    '-algorithm',
    'EC',
    '-pkeyopt',
    'ec_paramgen_curve:P-384',
    '-out',
    'inter.key',
  );
  openssl(
    dir,
    'req',
    '-new',
    '-key',
    'inter.key',
    '-subj',
    '/CN=Test App Attest CA 1',
    '-out',
    'inter.csr',
  );
  writeFileSync(
    join(dir, 'inter.ext'),
    'basicConstraints=critical,CA:true,pathlen:0\nkeyUsage=critical,keyCertSign\n',
  );
  openssl(
    dir,
    'x509',
    '-req',
    '-in',
    'inter.csr',
    '-CA',
    'root.pem',
    '-CAkey',
    'root.key',
    '-CAcreateserial',
    '-days',
    '3650',
    '-extfile',
    'inter.ext',
    '-out',
    'inter.pem',
  );

  openssl(
    dir,
    'genpkey',
    '-algorithm',
    'EC',
    '-pkeyopt',
    'ec_paramgen_curve:P-256',
    '-out',
    'leaf.key',
  );
  const leafPrivate = createPrivateKey(readFileSync(join(dir, 'leaf.key')));
  const jwk = createPublicKey(leafPrivate).export({ format: 'jwk' });
  const point = Buffer.concat([
    Buffer.of(4),
    Buffer.from(jwk.x as string, 'base64url'),
    Buffer.from(jwk.y as string, 'base64url'),
  ]);
  const keyId = sha256(point);

  const rpIdHash = sha256(
    Buffer.from(options.rpId ?? `${options.teamId}.${options.bundleId}`, 'utf8'),
  );
  const counter = Buffer.alloc(4);
  counter.writeUInt32BE(options.counter ?? 0);
  const aaguid =
    options.aaguid ??
    (options.environment === 'production'
      ? Buffer.concat([Buffer.from('appattest'), Buffer.alloc(7)])
      : Buffer.from('appattestdevelop'));
  const idLength = Buffer.alloc(2);
  idLength.writeUInt16BE(keyId.length);
  const authData = Buffer.concat([
    rpIdHash,
    Buffer.of(0x40),
    counter,
    aaguid,
    idLength,
    keyId,
    Buffer.from('cose-key-placeholder'),
  ]);
  const nonce = sha256(
    authData,
    sha256(Buffer.from(options.nonceChallenge ?? options.challenge, 'utf8')),
  );

  writeFileSync(
    join(dir, 'leaf.ext'),
    `1.2.840.113635.100.8.2=DER:3024a1220420${nonce.toString('hex')}\n`,
  );
  openssl(dir, 'req', '-new', '-key', 'leaf.key', '-subj', '/CN=leaf', '-out', 'leaf.csr');
  openssl(
    dir,
    'x509',
    '-req',
    '-in',
    'leaf.csr',
    '-CA',
    'inter.pem',
    '-CAkey',
    'inter.key',
    '-CAcreateserial',
    '-days',
    '365',
    '-extfile',
    'leaf.ext',
    '-out',
    'leaf.pem',
  );

  const leaf = new X509Certificate(readFileSync(join(dir, 'leaf.pem')));
  const inter = new X509Certificate(readFileSync(join(dir, 'inter.pem')));
  const attestation = encode({
    fmt: 'apple-appattest',
    attStmt: {
      x5c: [Buffer.from(leaf.raw), Buffer.from(inter.raw)],
      receipt: Buffer.from('receipt'),
    },
    authData,
  });

  return {
    attestation: Buffer.from(attestation).toString('base64'),
    keyId: keyId.toString('base64'),
    rootCertificatePem: readFileSync(join(dir, 'root.pem'), 'utf8'),
    otherRootPem: readFileSync(join(dir, 'attacker-root.pem'), 'utf8'),
    leafValidTo: new Date(leaf.validTo),
    makeAssertion(clientData, assertionCounter, key = leafPrivate, rpId) {
      const c = Buffer.alloc(4);
      c.writeUInt32BE(assertionCounter);
      const authenticatorData = Buffer.concat([
        sha256(Buffer.from(rpId ?? `${options.teamId}.${options.bundleId}`, 'utf8')),
        Buffer.of(0x40),
        c,
      ]);
      const signature = sign('sha256', sha256(authenticatorData, sha256(clientData)), key);
      return Buffer.from(encode({ signature, authenticatorData })).toString('base64');
    },
  };
}
