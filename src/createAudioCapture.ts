import { createDownsampler } from './reazonSpeech';
import audioCaptureWorkletUrl from './audioCapture.worklet.ts?worker&url';

export type AudioCapture = { disconnect: () => void };

// マイク音声を 16 kHz のチャンクとして onSamples に渡す。
// AudioWorklet が使えない古いブラウザでは ScriptProcessorNode で代替する。
export const createAudioCapture = async (
  audioContext: AudioContext,
  source: MediaStreamAudioSourceNode,
  onSamples: (samples: Float32Array) => void,
): Promise<AudioCapture> => {
  let node: AudioNode;
  let detach: () => void;
  if (audioContext.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
    await audioContext.audioWorklet.addModule(audioCaptureWorkletUrl);
    const worklet = new AudioWorkletNode(audioContext, 'audio-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      // ステレオ入力でも左右を混ぜたモノラルで受け取る。
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
    });
    worklet.port.onmessage = (event: MessageEvent<Float32Array>) => onSamples(event.data);
    detach = () => { worklet.port.onmessage = null; };
    node = worklet;
  } else {
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    const downsample = createDownsampler(audioContext.sampleRate);
    processor.onaudioprocess = (event) => onSamples(downsample(event.inputBuffer.getChannelData(0)));
    detach = () => { processor.onaudioprocess = null; };
    node = processor;
  }

  // 出力は使わないが、どのブラウザでも処理され続けるよう無音で destination へつなぐ。
  const silentGain = audioContext.createGain();
  silentGain.gain.value = 0;
  silentGain.connect(audioContext.destination);
  source.connect(node);
  node.connect(silentGain);

  return {
    disconnect: () => {
      detach();
      try { source.disconnect(node); } catch { /* 既に切断済み */ }
      node.disconnect();
      silentGain.disconnect();
    },
  };
};
