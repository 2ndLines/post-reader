/**
 * App Attest 验证（02 §10.2；Apple「Validating apps that connect to your server」的步骤）。受保护路径。
 *
 * 证明（attestation，设备首次登记）：
 *   1 CBOR 解码，fmt 为 apple-appattest；2 证书链（叶 → 中间 → 固定的 Apple App Attest 根证书）在当前时间有效；
 *   3 nonce = SHA256(authData ‖ SHA256(challenge))，必须等于叶证书扩展 1.2.840.113635.100.8.2 中的值；
 *   4 keyId = SHA256(叶证书公钥的未压缩点)；5 authData：rpIdHash = SHA256(teamId.bundleId)、counter = 0、
 *   aaguid 为 appattest（生产）或 appattestdevelop（开发）、credentialId = keyId。
 * 断言（assertion，之后每个需要证明的请求）：
 *   nonce = SHA256(authenticatorData ‖ SHA256(clientData))；用登记的公钥验证 ECDSA 签名；rpIdHash 相同；counter 单调递增。
 * 任何一步不符都拒绝（失败即关闭）。
 */
import { createHash, createPublicKey, type KeyObject, verify, X509Certificate } from 'node:crypto';
import { decode } from 'cbor-x';

const NONCE_OID = Buffer.from('06092a864886f763640802', 'hex'); // OID 1.2.840.113635.100.8.2（含 tag 与长度）
const AAGUID_PRODUCTION = Buffer.concat([Buffer.from('appattest', 'ascii'), Buffer.alloc(7)]);
const AAGUID_DEVELOPMENT = Buffer.from('appattestdevelop', 'ascii');

export class AttestError extends Error {
  readonly step: string;

  constructor(step: string) {
    super(`app attest rejected at ${step}`);
    this.name = 'AttestError';
    this.step = step;
  }
}

const sha256 = (...parts: Uint8Array[]) => {
  const h = createHash('sha256');
  for (const p of parts) h.update(p);
  return h.digest();
};

/** 读取一个 DER TLV，返回 { tag, 值的起止位置 } */
function readTlv(der: Buffer, offset: number): { tag: number; start: number; end: number } {
  const tag = der[offset] as number;
  let length = der[offset + 1] as number;
  let start = offset + 2;
  if (length & 0x80) {
    const bytes = length & 0x7f;
    if (bytes === 0 || bytes > 4) throw new AttestError('der');
    length = 0;
    for (let i = 0; i < bytes; i++) length = (length << 8) | (der[start + i] as number);
    start += bytes;
  }
  const end = start + length;
  if (end > der.length) throw new AttestError('der');
  return { tag, start, end };
}

/** 从叶证书 DER 中取出 Apple nonce 扩展：Extension ::= SEQUENCE { OID, [BOOLEAN], OCTET STRING { SEQUENCE { [1] { OCTET STRING nonce } } } } */
export function extractNonceExtension(certDer: Buffer): Buffer {
  const at = certDer.indexOf(NONCE_OID);
  if (at === -1) throw new AttestError('nonce-extension');
  let cursor = at + NONCE_OID.length;
  let next = readTlv(certDer, cursor);
  if (next.tag === 0x01) {
    cursor = next.end; // critical 标志
    next = readTlv(certDer, cursor);
  }
  if (next.tag !== 0x04) throw new AttestError('nonce-extension');
  const seq = readTlv(certDer, next.start);
  if (seq.tag !== 0x30) throw new AttestError('nonce-extension');
  const ctx = readTlv(certDer, seq.start);
  if (ctx.tag !== 0xa1) throw new AttestError('nonce-extension');
  const octet = readTlv(certDer, ctx.start);
  if (octet.tag !== 0x04 || octet.end - octet.start !== 32)
    throw new AttestError('nonce-extension');
  return certDer.subarray(octet.start, octet.end);
}

/** 未压缩的 EC 公钥点（0x04 ‖ X ‖ Y），keyId = SHA256(该点) */
function uncompressedPoint(key: KeyObject): Buffer {
  const jwk = key.export({ format: 'jwk' });
  if (jwk.kty !== 'EC' || !jwk.x || !jwk.y) throw new AttestError('public-key');
  return Buffer.concat([
    Buffer.of(0x04),
    Buffer.from(jwk.x, 'base64url'),
    Buffer.from(jwk.y, 'base64url'),
  ]);
}

interface AuthData {
  rpIdHash: Buffer;
  counter: number;
  aaguid: Buffer | undefined;
  credentialId: Buffer | undefined;
}

function parseAuthData(data: Buffer, withAttestedCredential: boolean): AuthData {
  if (data.length < 37) throw new AttestError('auth-data');
  const rpIdHash = data.subarray(0, 32);
  const counter = data.readUInt32BE(33);
  if (!withAttestedCredential)
    return { rpIdHash, counter, aaguid: undefined, credentialId: undefined };
  if (data.length < 55) throw new AttestError('auth-data');
  const aaguid = data.subarray(37, 53);
  const idLength = data.readUInt16BE(53);
  if (data.length < 55 + idLength) throw new AttestError('auth-data');
  return { rpIdHash, counter, aaguid, credentialId: data.subarray(55, 55 + idLength) };
}

export interface AttestationInput {
  /** CBOR 证明对象的 base64 */
  attestation: string;
  /** 客户端上报的 keyId（base64） */
  keyId: string;
  /** 服务端签发的一次性挑战 */
  challenge: string;
  teamId: string;
  bundleId: string;
  /** 固定的根证书（生产为 Apple App Attest Root CA） */
  rootCertificatePem: string;
  environment: 'production' | 'development';
  now?: Date;
}

export interface AttestedKey {
  keyId: string;
  /** SPKI DER，存 devices.public_key */
  publicKey: Buffer;
  receipt: Buffer | undefined;
}

export function verifyAttestation(input: AttestationInput): AttestedKey {
  let object: { fmt?: unknown; attStmt?: { x5c?: unknown; receipt?: unknown }; authData?: unknown };
  try {
    object = decode(Buffer.from(input.attestation, 'base64'));
  } catch {
    throw new AttestError('cbor');
  }
  if (object.fmt !== 'apple-appattest') throw new AttestError('format');
  const x5c = object.attStmt?.x5c;
  const authData = object.authData;
  if (!Array.isArray(x5c) || x5c.length < 2 || !(authData instanceof Uint8Array))
    throw new AttestError('structure');

  // 证书链：叶 → 中间 → 固定根；每一张都必须在当前时间有效
  const now = input.now ?? new Date();
  let leaf: X509Certificate;
  let intermediate: X509Certificate;
  let root: X509Certificate;
  try {
    leaf = new X509Certificate(Buffer.from(x5c[0] as Uint8Array));
    intermediate = new X509Certificate(Buffer.from(x5c[1] as Uint8Array));
    root = new X509Certificate(input.rootCertificatePem);
  } catch {
    throw new AttestError('certificate');
  }
  const issuedBy = (child: X509Certificate, parent: X509Certificate) =>
    child.checkIssued(parent) && child.verify(parent.publicKey);
  if (!issuedBy(leaf, intermediate) || !issuedBy(intermediate, root))
    throw new AttestError('chain');
  for (const cert of [leaf, intermediate, root]) {
    if (now < new Date(cert.validFrom) || now > new Date(cert.validTo))
      throw new AttestError('validity');
  }

  // nonce
  const auth = Buffer.from(authData);
  const expectedNonce = sha256(auth, sha256(Buffer.from(input.challenge, 'utf8')));
  if (!extractNonceExtension(Buffer.from(leaf.raw)).equals(expectedNonce))
    throw new AttestError('nonce');

  // keyId 与公钥
  const keyId = Buffer.from(input.keyId, 'base64');
  if (!sha256(uncompressedPoint(leaf.publicKey)).equals(keyId)) throw new AttestError('key-id');

  // authData
  const parsed = parseAuthData(auth, true);
  if (!parsed.rpIdHash.equals(sha256(Buffer.from(`${input.teamId}.${input.bundleId}`, 'utf8'))))
    throw new AttestError('rp-id');
  if (parsed.counter !== 0) throw new AttestError('counter');
  const expectedAaguid =
    input.environment === 'production' ? AAGUID_PRODUCTION : AAGUID_DEVELOPMENT;
  if (!parsed.aaguid?.equals(expectedAaguid)) throw new AttestError('aaguid');
  if (!parsed.credentialId?.equals(keyId)) throw new AttestError('credential-id');

  const receipt = object.attStmt?.receipt;
  return {
    keyId: input.keyId,
    publicKey: Buffer.from(leaf.publicKey.export({ format: 'der', type: 'spki' })),
    receipt: receipt instanceof Uint8Array ? Buffer.from(receipt) : undefined,
  };
}

export interface AssertionInput {
  /** CBOR 断言对象 { signature, authenticatorData } 的 base64 */
  assertion: string;
  /** 被签名的客户端数据（02 §10.2：method | path | bodySha256 | ts） */
  clientData: Uint8Array;
  /** 登记时保存的 SPKI DER */
  publicKey: Uint8Array;
  previousCounter: bigint;
  teamId: string;
  bundleId: string;
}

export function verifyAssertion(input: AssertionInput): { counter: bigint } {
  let object: { signature?: unknown; authenticatorData?: unknown };
  try {
    object = decode(Buffer.from(input.assertion, 'base64'));
  } catch {
    throw new AttestError('cbor');
  }
  if (
    !(object.signature instanceof Uint8Array) ||
    !(object.authenticatorData instanceof Uint8Array)
  ) {
    throw new AttestError('structure');
  }
  const authenticatorData = Buffer.from(object.authenticatorData);
  const nonce = sha256(authenticatorData, sha256(input.clientData));
  const key = createPublicKey({ key: Buffer.from(input.publicKey), format: 'der', type: 'spki' });
  if (!verify('sha256', nonce, key, Buffer.from(object.signature)))
    throw new AttestError('signature');
  const parsed = parseAuthData(authenticatorData, false);
  if (!parsed.rpIdHash.equals(sha256(Buffer.from(`${input.teamId}.${input.bundleId}`, 'utf8'))))
    throw new AttestError('rp-id');
  const counter = BigInt(parsed.counter);
  if (counter <= input.previousCounter) throw new AttestError('counter');
  return { counter };
}

/** 02 §10.2：clientDataHash 的输入为 `METHOD|PATH|hex(SHA256(rawBody))|X-Ts` */
export function assertionClientData(
  method: string,
  path: string,
  rawBody: Uint8Array,
  ts: string,
): Buffer {
  return Buffer.from(
    `${method.toUpperCase()}|${path}|${sha256(rawBody).toString('hex')}|${ts}`,
    'utf8',
  );
}
