/// <reference lib="webworker" />

import { initVADASRModule, OfflineRecognizer } from '@sherpaw/vad-asr';
import { loadVirtualData } from '@sherpaw/preloader';

type WorkerRequest =
  | { type: 'initialize'; baseUrl: string }
  | { type: 'transcribe'; session: number; id: number; samples: Float32Array }
  | { type: 'reset'; session: number }
  | { type: 'dispose' };

type ModelFile = { sources: string[]; target: string; size: number };

const MODEL_FILES: ModelFile[] = [
  { sources: ['tokens.txt'], target: 'tokens.txt', size: 45_754 },
  {
    sources: [
      'encoder-epoch-99-avg-1.int8.onnx.part-00',
      'encoder-epoch-99-avg-1.int8.onnx.part-01',
    ],
    target: 'encoder.onnx',
    size: 154_670_139,
  },
  { sources: ['decoder-epoch-99-avg-1.onnx'], target: 'decoder.onnx', size: 11_767_836 },
  { sources: ['joiner-epoch-99-avg-1.int8.onnx'], target: 'joiner.onnx', size: 2_696_970 },
];

let recognizer: OfflineRecognizer | null = null;
let currentSession = 0;
let processing = false;
const pending: Extract<WorkerRequest, { type: 'transcribe' }>[] = [];
const MAX_QUEUED_CHUNKS = 2;
const workerScope = globalThis as unknown as DedicatedWorkerGlobalScope;

const send = (message: Record<string, unknown>) => workerScope.postMessage(message);

const fetchInto = async (
  url: string,
  target: Uint8Array,
  targetOffset: number,
  completedBytes: number,
  totalBytes: number,
) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`モデル取得失敗: HTTP ${response.status}`);
  if (!response.body) {
    const value = new Uint8Array(await response.arrayBuffer());
    target.set(value, targetOffset);
    send({ type: 'progress', loaded: completedBytes + value.byteLength, total: totalBytes });
    return value.byteLength;
  }

  const reader = response.body.getReader();
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    target.set(value, targetOffset + received);
    received += value.byteLength;
    send({ type: 'progress', loaded: completedBytes + received, total: totalBytes });
  }
  return received;
};

const initialize = async (baseUrl: string) => {
  if (recognizer) {
    send({ type: 'ready' });
    return;
  }

  const module = await initVADASRModule();
  const totalBytes = MODEL_FILES.reduce((sum, file) => sum + file.size, 0);
  let completedBytes = 0;

  for (const file of MODEL_FILES) {
    const data = new Uint8Array(file.size);
    let fileOffset = 0;
    for (const source of file.sources) {
      fileOffset += await fetchInto(
        `${baseUrl}/${source}`,
        data,
        fileOffset,
        completedBytes + fileOffset,
        totalBytes,
      );
    }
    if (fileOffset !== file.size) throw new Error(`モデルサイズ不一致: ${file.target}`);
    loadVirtualData({ module, virtualData: { [file.target]: data } });
    completedBytes += fileOffset;
    send({ type: 'progress', loaded: completedBytes, total: totalBytes });
  }

  recognizer = new OfflineRecognizer({
    featConfig: { sampleRate: 16_000, featureDim: 80 },
    modelConfig: {
      tokens: './tokens.txt',
      numThreads: 1,
      provider: 'cpu',
      debug: 0,
      modelType: 'transducer',
      modelingUnit: 'cjkchar',
      transducer: {
        encoder: './encoder.onnx',
        decoder: './decoder.onnx',
        joiner: './joiner.onnx',
      },
    },
    decodingMethod: 'greedy_search',
    maxActivePaths: 4,
  }, module);
  send({ type: 'ready' });
};

const transcribe = (request: Extract<WorkerRequest, { type: 'transcribe' }>) => {
  if (!recognizer) throw new Error('ReazonSpeechモデルが未初期化です。');
  const stream = recognizer.createStream();
  try {
    stream.acceptWaveform(16_000, request.samples);
    recognizer.decode(stream);
    const result = recognizer.getResult(stream) as { text?: string };
    if (request.session === currentSession) send({ type: 'result', session: request.session, id: request.id, text: result.text?.trim() || '' });
  } finally {
    stream.free();
  }
};

const processQueue = () => {
  if (processing) return;
  processing = true;
  try {
    while (pending.length > 0) {
      const request = pending.shift();
      if (!request || request.session !== currentSession) continue;
      try {
        transcribe(request);
      } catch (error) {
        send({ type: 'error', session: request.session, id: request.id, message: error instanceof Error ? error.message : String(error) });
      }
    }
  } finally {
    processing = false;
  }
};

workerScope.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === 'initialize') return await initialize(request.baseUrl.replace(/\/$/, ''));
    if (request.type === 'reset') {
      currentSession = request.session;
      pending.splice(0).forEach((item) => send({ type: 'dropped', session: item.session, id: item.id }));
      return;
    }
    if (request.type === 'dispose') {
      pending.length = 0;
      recognizer?.free();
      recognizer = null;
      return;
    }
    if (request.session !== currentSession) {
      currentSession = request.session;
      pending.splice(0).forEach((item) => send({ type: 'dropped', session: item.session, id: item.id }));
    }
    if (pending.length >= MAX_QUEUED_CHUNKS) {
      const dropped = pending.shift();
      if (dropped) send({ type: 'dropped', session: dropped.session, id: dropped.id });
    }
    pending.push(request);
    processQueue();
  } catch (error) {
    send({ type: 'error', session: request.type === 'transcribe' ? request.session : undefined, id: request.type === 'transcribe' ? request.id : undefined, message: error instanceof Error ? error.message : String(error) });
  }
});

export {};
