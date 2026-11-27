import { generateKeyPairSync } from 'node:crypto';
import { encode } from 'cbor-x';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  AttestError,
  assertionClientData,
  extractNonceExtension,
  verifyAssertion,
  verifyAttestation,
} from './attest.ts';
import { type AttestFixture, makeAttestFixture } from './attest-fixture.ts';

const base = { teamId: 'TEAM123456', bundleId: 'com.example.postreader', challenge: 'challenge-1' };
const stepOf = (fn: () => unknown) => {
  try {
    fn();
    return 'passed';
  } catch (error) {
    return error instanceof AttestError ? error.step : `unexpected: ${(error as Error).message}`;
  }
};

let dev: AttestFixture;
beforeAll(() => {
  dev = makeAttestFixture({ ...base, environment: 'development' });
}, 60_000);

const input = (
  f: AttestFixture,
  overrides: Partial<Parameters<typeof verifyAttestation>[0]> = {},
) => ({
  attestation: f.attestation,
  keyId: f.keyId,
  challenge: base.challenge,
  teamId: base.teamId,
  bundleId: base.bundleId,
  rootCertificatePem: f.rootCertificatePem,
  environment: 'development' as const,
  ...overrides,
});

describe('证明 attestation（02 §10.2）', () => {
  it('合法证明通过：返回 keyId、SPKI 公钥与回执', () => {
    const result = verifyAttestation(input(dev));
    expect(result.keyId).toBe(dev.keyId);
    expect(result.publicKey.length).toBeGreaterThan(60);
    expect(result.receipt?.toString()).toBe('receipt');
  });

  it.each([
    ['挑战不符', { challenge: 'other-challenge' }, 'nonce'],
    ['Team ID 或 Bundle ID 不符', { bundleId: 'com.other.app' }, 'rp-id'],
    ['上报的 keyId 与证书公钥不符', { keyId: Buffer.alloc(32, 1).toString('base64') }, 'key-id'],
    ['证书链不通向固定的根证书', { rootCertificatePem: '' }, 'certificate'],
    ['生产环境却是开发 aaguid', { environment: 'production' as const }, 'aaguid'],
    ['不是 CBOR', { attestation: 'bm90LWNib3I=' }, 'cbor'],
    [
      'fmt 不是 apple-appattest',
      { attestation: Buffer.from(encode({ fmt: 'packed' })).toString('base64') },
      'format',
    ],
  ])('拒绝：%s', (_n, overrides, step) => {
    expect(stepOf(() => verifyAttestation(input(dev, overrides)))).toBe(step);
  });

  it('攻击者自建的根证书：拒绝（chain）', () => {
    expect(
      stepOf(() => verifyAttestation(input(dev, { rootCertificatePem: dev.otherRootPem }))),
    ).toBe('chain');
  });

  it('叶证书过期后：拒绝（validity）', () => {
    const later = new Date(dev.leafValidTo.getTime() + 86_400_000);
    expect(stepOf(() => verifyAttestation(input(dev, { now: later })))).toBe('validity');
  });

  it.each([
    ['authData 中 counter 不为 0', { counter: 1 }, 'counter'],
    ['authData 中 rpId 不符', { rpId: 'TEAM123456.com.attacker' }, 'rp-id'],
    ['nonce 用别的挑战算出', { nonceChallenge: 'stale' }, 'nonce'],
  ])(
    '拒绝：%s',
    (_n, fixtureOverrides, step) => {
      const f = makeAttestFixture({ ...base, environment: 'development', ...fixtureOverrides });
      expect(stepOf(() => verifyAttestation(input(f)))).toBe(step);
    },
    60_000,
  );

  it('生产环境的证明在 production 下通过', () => {
    const prod = makeAttestFixture({ ...base, environment: 'production' });
    expect(stepOf(() => verifyAttestation(input(prod, { environment: 'production' })))).toBe(
      'passed',
    );
  }, 60_000);

  it('没有 nonce 扩展的证书：extractNonceExtension 拒绝', () => {
    expect(() => extractNonceExtension(Buffer.from('3003020101', 'hex'))).toThrow(AttestError);
  });
});

describe('断言 assertion（02 §10.2）', () => {
  const clientData = assertionClientData(
    'POST',
    '/v1/auth/refresh',
    new TextEncoder().encode('{"refreshToken":"x"}'),
    '1764144000000',
  );
  const publicKey = () => verifyAttestation(input(dev)).publicKey;
  const assertionInput = (assertion: string, previousCounter = 0n, data = clientData) => ({
    assertion,
    clientData: data,
    publicKey: publicKey(),
    previousCounter,
    teamId: base.teamId,
    bundleId: base.bundleId,
  });

  it('签名有效且 counter 递增：通过并返回新的 counter', () => {
    expect(verifyAssertion(assertionInput(dev.makeAssertion(clientData, 1))).counter).toBe(1n);
  });

  it('counter 没有递增（重放）：拒绝', () => {
    expect(
      stepOf(() => verifyAssertion(assertionInput(dev.makeAssertion(clientData, 5), 5n))),
    ).toBe('counter');
  });

  it('请求内容被改动：签名不符', () => {
    const tampered = assertionClientData(
      'POST',
      '/v1/auth/refresh',
      new TextEncoder().encode('{"refreshToken":"y"}'),
      '1764144000000',
    );
    expect(
      stepOf(() => verifyAssertion(assertionInput(dev.makeAssertion(clientData, 2), 0n, tampered))),
    ).toBe('signature');
  });

  it('用别的密钥签名：拒绝', () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    expect(
      stepOf(() => verifyAssertion(assertionInput(dev.makeAssertion(clientData, 3, privateKey)))),
    ).toBe('signature');
  });

  it('authenticatorData 的 rpId 不符：拒绝', () => {
    expect(
      stepOf(() =>
        verifyAssertion(assertionInput(dev.makeAssertion(clientData, 4, undefined, 'X.y'))),
      ),
    ).toBe('rp-id');
  });

  it('clientData 的格式为 METHOD|PATH|hex(SHA256(body))|ts', () => {
    expect(assertionClientData('post', '/v1/x', new Uint8Array(), '1').toString()).toBe(
      'POST|/v1/x|e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855|1',
    );
  });
});
