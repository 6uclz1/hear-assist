import { downsampleAudio, joinAudioChunks, keepLastSamples, mergeTranscripts } from './reazonSpeech';

test('merges the two-second transcript overlap without duplicating text', () => {
  expect(mergeTranscripts('今日は天気がいいですね', '天気がいいですね散歩しましょう')).toBe(
    '今日は天気がいいですね 散歩しましょう',
  );
});

test('keeps unrelated recognition results', () => {
  expect(mergeTranscripts('こんにちは。', '次の話題です')).toBe('こんにちは。次の話題です');
});

test('joins audio chunks and retains the requested tail', () => {
  const chunks = [new Float32Array([1, 2]), new Float32Array([3, 4, 5])];
  expect(Array.from(joinAudioChunks(chunks))).toEqual([1, 2, 3, 4, 5]);
  expect(Array.from(keepLastSamples(chunks, 3)[0])).toEqual([3, 4, 5]);
});

test('downsamples microphone audio to 16 kHz', () => {
  const input = new Float32Array(48_000).fill(0.5);
  const output = downsampleAudio(input, 48_000);
  expect(output).toHaveLength(16_000);
  expect(output[0]).toBeCloseTo(0.5);
});
