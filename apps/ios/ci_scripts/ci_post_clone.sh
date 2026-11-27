#!/bin/sh
# Xcode Cloud 克隆后执行（05 §5.4）：安装 mise 与固定版本的 iOS 工具，再生成工程。
# 工作流（PR / Main / Release）在 App Store Connect 中配置，需要负责人的 Apple 开发者账号。
set -eu
cd "$CI_PRIMARY_REPOSITORY_PATH"
if ! command -v mise >/dev/null 2>&1; then
  brew install mise
fi
mise trust --yes .mise.toml
mise install xcodegen swiftlint swiftformat
make -C apps/ios project
