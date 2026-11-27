#!/usr/bin/env python3
"""请求签名黄金向量（02 §10.3；P2-SRV-06）。只用 Python 标准库，与 TS、Swift 实现无关。

string_to_sign = METHOD \\n PATH \\n CANONICAL_QUERY \\n X-Ts \\n X-Nonce \\n hex(SHA256(rawBody))
X-Sig = base64url(HMAC-SHA256(k_sess, string_to_sign))，无填充

CANONICAL_QUERY（02 未定义，P2-SRV-06 Q1 默认）：
  对查询参数按（解码后的键、值）的码点顺序排序；键与值按 RFC 3986 百分号编码（只保留 A-Z a-z 0-9 - . _ ~，
  其余按 UTF-8 字节编码为 %XX 大写）；以 key=value 用 & 连接；没有查询参数时为空串。
METHOD 大写；PATH 为不含查询串的路径，原样（含 /v1 前缀）。

用法：python3 scripts/request_signature_vectors.py [--write]
"""
import base64
import hashlib
import hmac
import json
import pathlib
import sys
import urllib.parse

OUT = pathlib.Path(__file__).resolve().parent.parent / "vectors" / "request-signature.json"
KEY = bytes(range(32))  # 测试用 k_sess：00 01 … 1f

CASES = [
    {"name": "post-json-body", "method": "POST", "path": "/v1/jobs", "query": [], "ts": "1764144000000",
     "nonce": "n-001", "body": '{"targetLang":"zh-CN"}'},
    {"name": "empty-body", "method": "POST", "path": "/v1/auth/logout", "query": [], "ts": "1764144000000",
     "nonce": "n-002", "body": ""},
    {"name": "query-sorted-and-encoded", "method": "GET", "path": "/v1/samples",
     "query": [["lang", "zh-CN"], ["b", "2"], ["a", "x y"], ["a", "1"], ["emoji", "👍"]],
     "ts": "1764144000123", "nonce": "n-003", "body": ""},
    {"name": "lowercase-method-normalized", "method": "delete", "path": "/v1/account", "query": [],
     "ts": "1764144000000", "nonce": "n-004", "body": ""},
    {"name": "utf8-body", "method": "PATCH", "path": "/v1/me", "query": [], "ts": "1764144000000",
     "nonce": "n-005", "body": '{"billingTz":"Asia/Shanghai","note":"你好"}'},
    {"name": "reserved-chars-in-query", "method": "GET", "path": "/v1/jobs/j-1", "query": [["q", "a&b=c/d?"], ["~safe", "-._~"]],
     "ts": "1764144000000", "nonce": "n-006", "body": ""},
]


def canonical_query(pairs):
    enc = lambda s: urllib.parse.quote(s, safe="-._~")  # noqa: E731
    return "&".join(f"{enc(k)}={enc(v)}" for k, v in sorted(pairs))


def sign(case):
    body_hash = hashlib.sha256(case["body"].encode("utf-8")).hexdigest()
    sts = "\n".join([case["method"].upper(), case["path"], canonical_query(case["query"]), case["ts"], case["nonce"], body_hash])
    sig = base64.urlsafe_b64encode(hmac.new(KEY, sts.encode("utf-8"), hashlib.sha256).digest()).rstrip(b"=").decode()
    return sts, sig


def main():
    vectors = {"key_hex": KEY.hex(), "vectors": []}
    for case in CASES:
        sts, sig = sign(case)
        vectors["vectors"].append({**case, "expectedCanonicalQuery": canonical_query(case["query"]),
                                   "expectedStringToSign": sts, "expectedSig": sig})
    text = json.dumps(vectors, ensure_ascii=False, indent=2) + "\n"
    if "--write" in sys.argv[1:]:
        OUT.write_text(text, encoding="utf-8")
        print(f"已写入 {OUT.name}：{len(CASES)} 条")
        return 0
    # 按内容比较：文件可能被格式化工具（Biome）改过排版，排版不同不算不一致
    same = OUT.exists() and json.loads(OUT.read_text(encoding="utf-8")) == vectors
    print(f"请求签名向量：{'一致' if same else '不一致（请运行 --write 重新生成，不要手改）'}")
    return 0 if same else 1


if __name__ == "__main__":
    sys.exit(main())
