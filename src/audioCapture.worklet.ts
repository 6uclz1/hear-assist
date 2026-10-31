// マイク音声をオーディオスレッドで 16 kHz へ変換し、約 100ms ごとにメインスレッドへ渡す。
// 非推奨の ScriptProcessorNode と違い、メインスレッドの負荷で音が途切れにくい。
import { createDownsampler, SAMPLE_RATE } from './reazonSpeech';

declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, processorCtor: new () => AudioWorkletProcessor): void;

const BATCH_SAMPLES = SAMPLE_RATE / 10;

class AudioCaptureProcessor extends AudioWorkletProcessor {
  private readonly downsample = createDownsampler(sampleRate);
  private batch = new Float32Array(BATCH_SAMPLES);
  private filled = 0;

  process(inputs: Float32Array[][]) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;

    const samples = this.downsample(channel);
    let offset = 0;
    while (offset < samples.length) {
      const count = Math.min(samples.length - offset, BATCH_SAMPLES - this.filled);
      this.batch.set(samples.subarray(offset, offset + count), this.filled);
      this.filled += count;
      offset += count;
      if (this.filled === BATCH_SAMPLES) {
        this.port.postMessage(this.batch, [this.batch.buffer]);
        this.batch = new Float32Array(BATCH_SAMPLES);
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor('audio-capture', AudioCaptureProcessor);
