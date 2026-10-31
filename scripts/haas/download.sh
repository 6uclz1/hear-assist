#!/usr/bin/env bash
# Haas-ja-v1.0 の量子化 ONNX を取得し、ブラウザ用に変換・分割して配置する。
# 使い方: scripts/haas/download.sh [出力先]（既定は public/models/haas）。uv が必要。
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
out="${1:-$repo_root/public/models/haas}"
# 取得元のリビジョンを固定する（変換結果のサイズは src/reazonSpeech.worker.ts と一致させる）。
revision=7f5ab0a4b1bf39db78afd6691eeecbc4f9d42e39
base="https://huggingface.co/oboroge0/Haas-ja-v1.0-onnx-quantized/resolve/$revision"
expected_encoder_size=452958828
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

for file in tokens.txt decoder.onnx joiner.onnx encoder.quantized.onnx encoder.data; do
  curl --fail --location --retry 3 --silent --show-error --output "$work/$file" "$base/$file"
done

uv run --quiet --no-project --with onnx==1.23.2 --with numpy==2.5.4 \
  python "$repo_root/scripts/haas/prepare_wasm_encoder.py" \
  "$work/encoder.quantized.onnx" "$work/encoder.wasm.onnx"

encoder_size="$(wc -c < "$work/encoder.wasm.onnx" | tr -d ' ')"
if [ "$encoder_size" != "$expected_encoder_size" ]; then
  echo "encoder.wasm.onnx のサイズが想定と異なります: $encoder_size" >&2
  exit 1
fi

mkdir -p "$out"
rm -f "$out"/encoder.wasm.onnx.part-*
cp "$work/tokens.txt" "$work/decoder.onnx" "$work/joiner.onnx" "$out/"
# GitHub Pages の 100MB 制限に合わせて分割し、ブラウザ内で再構成する。
split -b 75m -d -a 2 "$work/encoder.wasm.onnx" "$out/encoder.wasm.onnx.part-"
ls -l "$out"
