#!/bin/sh
# 取得 GRDB v7.12.0 源码并启用 SQLCipher（01 §9.1、05 §1.2 V2、ADR 0019）。
# GRDB 经 SPM 使用 SQLCipher 只能修改它的 Package.swift（上游 README「Encryption」），所以：
#   1 下载固定 tag 的源码包并校验 SHA-256；2 校验上游 Package.swift 未变；3 用 GRDB.Package.swift 覆盖。
# 结果在 apps/ios/Vendor/GRDB（不入库）。make project 与 Xcode Cloud 的 ci_post_clone.sh 调用本脚本。
set -eu
VERSION=7.12.0
TARBALL_SHA256=4c04a44597aec00df2c754ef39e73cac695fe7e647e9fc2efff8a08dad0d7cc6
UPSTREAM_MANIFEST_SHA256=4118b6c48dcb87f91d95fe40420371b8a474a44b0b0be2bf0417e0be1ebf7853

here=$(cd "$(dirname "$0")" && pwd)
dest="$here/GRDB"
stamp="$dest/.post-reader-version"
if [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$VERSION" ] && cmp -s "$here/GRDB.Package.swift" "$dest/Package.swift"; then
  exit 0
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
curl -fsSL -o "$work/grdb.tar.gz" "https://github.com/groue/GRDB.swift/archive/refs/tags/v$VERSION.tar.gz"
actual=$(shasum -a 256 "$work/grdb.tar.gz" | cut -d' ' -f1)
if [ "$actual" != "$TARBALL_SHA256" ]; then
  echo "GRDB 源码包摘要不符：$actual" >&2
  exit 1
fi
tar -xzf "$work/grdb.tar.gz" -C "$work"
src="$work/GRDB.swift-$VERSION"
manifest=$(shasum -a 256 "$src/Package.swift" | cut -d' ' -f1)
if [ "$manifest" != "$UPSTREAM_MANIFEST_SHA256" ]; then
  echo "上游 Package.swift 与预期不同，需要重新核对 GRDB.Package.swift" >&2
  exit 1
fi
cp "$here/GRDB.Package.swift" "$src/Package.swift"
echo "$VERSION" > "$src/.post-reader-version"
rm -rf "$dest"
mv "$src" "$dest"
