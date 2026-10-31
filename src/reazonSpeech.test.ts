import { createDownsampler, downsampleAudio, joinAudioChunks, keepLastSamples, mergeTranscriptChunk, mergeTranscripts } from './reazonSpeech';

test('merges the two-second transcript overlap without duplicating text', () => {
  expect(mergeTranscripts('今日は天気がいいですね', '天気がいいですね散歩しましょう')).toBe(
    '今日は天気がいいですね 散歩しましょう',
  );
});

test('keeps unrelated recognition results', () => {
  expect(mergeTranscripts('こんにちは。', '次の話題です')).toBe('こんにちは。次の話題です');
});

test('returns only the newly appended text for subtitle highlighting', () => {
  expect(mergeTranscriptChunk('今日は良い天気です', '良い天気です散歩します')).toEqual({
    transcript: '今日は良い天気です 散歩します',
    addition: '散歩します',
  });
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

test('ignores punctuation differences at chunk boundaries', () => {
  expect(mergeTranscriptChunk('打ち合わせがあります。資料は前日', 'があります資料は前日までに共有してください。')).toEqual({
    transcript: '打ち合わせがあります。資料は前日 までに共有してください。',
    addition: 'までに共有してください。',
  });
  expect(mergeTranscripts('資料は前日までに共有してください。', '共有してください')).toBe('資料は前日までに共有してください。');
});

test('keeps the 16 kHz sample count exact across small audio blocks', () => {
  for (const rate of [44_100, 48_000]) {
    const downsample = createDownsampler(rate);
    const blocks = 3_750;
    let total = 0;
    for (let block = 0; block < blocks; block += 1) total += downsample(new Float32Array(128).fill(0.25)).length;
    expect(Math.abs(total - (blocks * 128 * 16_000) / rate)).toBeLessThanOrEqual(1);
  }
});

test('repeats samples instead of inserting silence below 16 kHz', () => {
  const output = createDownsampler(8_000)(new Float32Array(8_000).fill(0.5));
  expect(output).toHaveLength(16_000);
  expect(output.every((sample) => sample === 0.5)).toBe(true);
});
