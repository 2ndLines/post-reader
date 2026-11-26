#!/bin/sh
# 创建本地 bucket。可重复执行：先列出已有 bucket，只创建缺少的（weed shell 对已存在的 bucket 返回非 0）
set -eu
master="s3:9333"
existing="$(echo "s3.bucket.list" | weed shell -master="${master}" | awk '{print $1}')"
for bucket in reader-audio-public reader-audio-private reader-samples reader-config testbench-artifacts; do
  if printf '%s\n' "${existing}" | grep -qx "${bucket}"; then
    echo "exists  ${bucket}"
  else
    echo "s3.bucket.create -name ${bucket}" | weed shell -master="${master}"
  fi
done
