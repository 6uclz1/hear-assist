# Hear Assist

iPhone などのマイク入力を、大きく読みやすい字幕として表示する Web アプリです。

## 音声認識方式

- **Web Speech**: ブラウザ標準の音声認識を利用します。
- **端末内認識**: 日本語モデルを Web Worker で実行し、音声を端末外へ送信しません。モデルは次の2つから選べます。
  - **標準（ReazonSpeech）**: 初回の取得は約180 MBです。
  - **高精度（Haas）**: [Haas-ja-v1.0](https://huggingface.co/third-intelligence/Haas-ja-v1.0) を使います。初回の取得は約480 MBで、処理の負荷も大きくなります。

端末内認識（ReazonSpeech）が既定です。VAD に頼らず、重なりのある固定長音声を処理します。更新速度は、高速（4秒）、標準（6秒）、高精度（10秒）から選べます。

日常画面は字幕と大きな開始・停止操作だけに絞り、詳細設定と診断は設定ダイアログへ分離しています。字幕画面には次の機能があります。

- 認識状態、最終字幕からの経過時間、推論遅延の常時表示
- 黒・白・黄色の高コントラスト配色
- 最新1行、最新2行、履歴表示と行間・文字サイズ調整
- 全面表示と横向き画面への最適化
- 画面ロックや通話などの割り込み後の自動復帰
- 推論待ちを有界化し、遅延時は古い音声より最新の会話を優先

## 開発

Node.js 24 を使います（`.nvmrc`）。

```sh
npm ci
npm start
```

サプライチェーン攻撃対策として、`.npmrc` で依存パッケージのインストールスクリプト実行と git 経由の依存を禁止し、公開から7日未満のバージョンを解決しないようにしています（`min-release-age` は npm 11.10 以降で有効）。インストールスクリプトが必要な依存を追加するときは、内容を確認してから `npm install-scripts approve <pkg>` で `package.json` の `allowScripts` に登録します。CI では GitHub Actions をコミット SHA で固定し、npm の依存を実行するビルドジョブには読み取り権限だけを与え、デプロイジョブではモデルの SHA-256 を検証します。Dependabot も7日間の待機期間を置いて更新を提案します。

主なコマンド:

- `npm test`: Vitest でテストを実行
- `npm run lint`: ESLint でコードを検査
- `npm run build`: TypeScript を検査し、Vite で本番ビルド
- `npm run check`: テスト、lint、ビルドをまとめて実行

### 端末内モデルをローカルで確認する

モデル本体はリポジトリに含めません。Haas は `scripts/haas/download.sh`（`uv` が必要）で `public/models/haas/` に配置できます。iOS Safari は http で開いたページの WebAssembly が極端に遅く、マイクも使えないため、iPhone 実機では `npm run build` のあと `scripts/haas/serve_https.py` で HTTPS 配信して確認します。

## 技術構成

- React 19 / React Compiler
- TypeScript
- Vite 8 / AudioWorklet（16 kHz へのリサンプリングをオーディオスレッドで実行）
- Vitest / Testing Library
- vite-plugin-pwa / Workbox
- ReazonSpeech / Haas-ja-v1.0 / sherpa-onnx

モデル本体はリポジトリに含めません。`master` の GitHub Pages ワークフローが公式の `sherpa-onnx-zipformer-ja-reazonspeech-2024-08-01` と、Haas-ja-v1.0 の sherpa-onnx 互換量子化版（[oboroge0/Haas-ja-v1.0-onnx-quantized](https://huggingface.co/oboroge0/Haas-ja-v1.0-onnx-quantized)）を取得し、デプロイ成果物へ追加します。Haas は sherpa-onnx の WebAssembly 版で読めるよう、外部データの埋め込みと `ConvInteger` 重みの uint8 化を行います（計算結果は変わりません）。GitHub Pages の制限に合わせてエンコーダーを分割し、ブラウザ内で再構成します。

[ReazonSpeech モデル](https://huggingface.co/reazon-research/reazonspeech-k2-v2)、[Haas-ja-v1.0](https://huggingface.co/third-intelligence/Haas-ja-v1.0)、[sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)、ブラウザ用ラッパーは Apache License 2.0 で配布されています。
