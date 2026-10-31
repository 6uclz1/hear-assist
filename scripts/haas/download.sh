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

# 取得したファイルの SHA-256（リビジョン固定に加え、配信元の改ざんや破損を検出する）。
checksums="ec78b13c5d9f156cf0d5fdbd6b5aec5785680f319c92630c11d5d11b14b83a84  tokens.txt
2947cb5512699cbba753fe45fe221428aadaa9856597debbb7aabe19cc253622  decoder.onnx
8a68320e750890ff9e944a794b41ae1c42c6f439ac4c273503458a6b42adc12d  joiner.onnx
aba291d61d3d594bc6fb8c7f90acbd980e7bc7bf6b7caaf3965ddc25e6f42fac  encoder.quantized.onnx
30befbf6aeb75383e6551f5e58de53efdb76972ddc7d0f76070c517899873586  encoder.data"

for file in tokens.txt decoder.onnx joiner.onnx encoder.quantized.onnx encoder.data; do
  curl --fail --location --proto '=https' --tlsv1.2 --retry 3 --silent --show-error --output "$work/$file" "$base/$file"
done

if command -v sha256sum > /dev/null; then
  (cd "$work" && sha256sum --check --strict --quiet <<< "$checksums")
else
  (cd "$work" && shasum -a 256 --check --strict --quiet <<< "$checksums")
fi

# 推移的な依存も含めて解決結果を固定するため、この日時以降に公開されたパッケージは使わない。
uv run --quiet --no-project --exclude-newer 2026-10-20T00:00:00Z --with onnx==1.23.2 --with numpy==2.5.4 \
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
