# Hear Assist

iPhone などのマイク入力を、大きく読みやすい字幕として表示する Web アプリです。

## 音声認識方式

- **Web Speech**: ブラウザ標準の音声認識を利用します。
- **ReazonSpeech（端末内）**: 日本語モデルを Web Worker で実行し、音声を端末外へ送信しません。

ReazonSpeech は既定の認識方式です。VAD に頼らず、重なりのある固定長音声を処理します。更新速度は、高速（4秒）、標準（6秒）、高精度（10秒）から選べます。初回は量子化モデルと WebAssembly ランタイムを約180 MBダウンロードします。

日常画面は字幕と大きな開始・停止操作だけに絞り、詳細設定と診断は設定ダイアログへ分離しています。字幕画面には次の機能があります。

- 認識状態、最終字幕からの経過時間、推論遅延の常時表示
- 黒・白・黄色の高コントラスト配色
- 最新1行、最新2行、履歴表示と行間・文字サイズ調整
- 全面表示と横向き画面への最適化
- 画面ロックや通話などの割り込み後の自動復帰
- 推論待ちを有界化し、遅延時は古い音声より最新の会話を優先

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
