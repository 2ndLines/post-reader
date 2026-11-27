#!/usr/bin/env python3
"""独立计算黄金向量的 expectedHash（SPEC.md §3、§4）。

只用 Python 标准库，与 TS、Swift 实现都无关，用来防止「用被测实现生成期望值」。
摘要的输入是向量中人工写出的 expectedClean，而不是任何实现的清洗结果。

用法：
  python3 scripts/expected_hash.py          # 校验；有不一致或缺失时退出码为 1
  python3 scripts/expected_hash.py --write  # 计算并回写 expectedHash
"""
import hashlib
import json
import pathlib
import re
import struct
import sys

VECTORS = pathlib.Path(__file__).resolve().parent.parent / "vectors"
INVISIBLE = re.compile(
    "[\u007f- ­؜ ᠎ -‏ -  -⁯"
    "　︎️﻿￰-￿]"
)


def lp(value: str) -> bytes:
    data = value.encode("utf-8")
    return struct.pack(">I", len(data)) + data


def unit_hash(unit_id: str, author_id: str, clean_text: str) -> str:
    return hashlib.sha256(lp(unit_id) + lp(author_id) + lp(clean_text)).hexdigest()


def dumps(items: list) -> str:
    """不可见字符写成 \\uXXXX，便于审阅；其余字符保持原样。"""
    text = json.dumps(items, ensure_ascii=False, indent=2)
    return INVISIBLE.sub(lambda m: "\\u%04x" % ord(m.group()), text) + "\n"


def main() -> int:
    write = "--write" in sys.argv[1:]
    assert lp("ab") == bytes.fromhex("000000026162") and lp("") == bytes.fromhex("00000000")
    mismatches = 0
    total = 0
    for path in sorted(VECTORS.glob("*.json")):
        items = json.loads(path.read_text(encoding="utf-8"))
        for item in items:
            total += 1
            expected = unit_hash(item["unitId"], item["authorId"], item["expectedClean"])
            if item.get("expectedHash") != expected:
                mismatches += 1
                if write:
                    item["expectedHash"] = expected
                else:
                    print(f"不一致  {path.name}  {item['name']}", file=sys.stderr)
        if write:
            text = dumps(items)
            assert json.loads(text) == items
            path.write_text(text, encoding="utf-8")
    action = "已回写" if write else "不一致"
    print(f"expectedHash：{total} 条，{action} {mismatches} 条")
    return 0 if write or mismatches == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
