# Hear Assist

iPhone などのマイク入力を、大きく読みやすい字幕として表示する Web アプリです。

## 音声認識方式

- **Web Speech**: ブラウザ標準の音声認識を利用します。
- **ReazonSpeech（端末内）**: 日本語モデルを Web Worker で実行し、音声を端末外へ送信しません。

ReazonSpeech は VAD に頼らず、重なりのある固定長音声を処理します。更新速度は、高速（4秒）、標準（6秒）、高精度（10秒）から選べます。初回は量子化モデルと WebAssembly ランタイムを約180 MBダウンロードします。

字幕画面には、最新チャンクのハイライト、文字サイズ調整、全画面表示があります。入力レベルと認識イベントの診断表示も備えています。

## 開発

Node.js 22 を推奨します。

```sh
npm ci
npm start
```

主なコマンド:

- `npm test`: Vitest でテストを実行
- `npm run lint`: ESLint でコードを検査
- `npm run build`: TypeScript を検査し、Vite で本番ビルド
- `npm run check`: テスト、lint、ビルドをまとめて実行

## 技術構成

- React 19 / React Compiler
- TypeScript
- Vite 8
- Vitest / Testing Library
- vite-plugin-pwa / Workbox
- ReazonSpeech / sherpa-onnx

モデル本体はリポジトリに含めません。`master` の GitHub Pages ワークフローが公式の `sherpa-onnx-zipformer-ja-reazonspeech-2024-08-01` を取得し、デプロイ成果物へ追加します。GitHub Pages の制限に合わせてエンコーダーを分割し、ブラウザ内で再構成します。

[ReazonSpeech モデル](https://huggingface.co/reazon-research/reazonspeech-k2-v2)、[sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)、ブラウザ用ラッパーは Apache License 2.0 で配布されています。
