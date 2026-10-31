const SAMPLE_RATE = 16_000;

// 入力を 16 kHz へ平均化して間引く。状態を持つので、細かいブロックに分けて渡しても
// ブロック境界で丸め誤差が積み重ならず、出力サンプル数が実時間からずれない。
// 16 kHz 未満の入力（Bluetooth マイクなど）では直前のサンプルを繰り返して補う。
export const createDownsampler = (inputRate: number) => {
  const ratio = inputRate / SAMPLE_RATE;
  let consumed = 0;
  let produced = 0;
  let boundary = ratio;
  let sum = 0;
  let count = 0;
  let last = 0;

  return (input: Float32Array) => {
    if (inputRate === SAMPLE_RATE) return new Float32Array(input);
    const output = new Float32Array(Math.ceil(input.length / ratio) + 2);
    let written = 0;
    for (let index = 0; index < input.length; index += 1) {
      sum += input[index];
      count += 1;
      consumed += 1;
      while (consumed >= Math.ceil(boundary)) {
        last = count ? sum / count : last;
        output[written] = last;
        written += 1;
        sum = 0;
        count = 0;
        produced += 1;
        boundary = (produced + 1) * ratio;
      }
    }
    return output.slice(0, written);
  };
};

export const downsampleAudio = (input: Float32Array, inputRate: number) => createDownsampler(inputRate)(input);

export const joinAudioChunks = (chunks: Float32Array[]) => {
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Float32Array(size);
  let offset = 0;
  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.length;
  });
  return result;
};

export const keepLastSamples = (chunks: Float32Array[], count: number) => {
  const joined = joinAudioChunks(chunks);
  return joined.length <= count ? [joined] : [joined.slice(joined.length - count)];
};

// 重なりの判定では空白と句読点を無視する。モデルによってチャンク境界の句読点が変わるため。
const IGNORED_FOR_OVERLAP = /[\s、。，．,.！？!?「」『』]/;
const normalizeForOverlap = (value: string) => Array.from(value).filter((char) => !IGNORED_FOR_OVERLAP.test(char)).join('');

const sliceAfterComparableChars = (value: string, count: number) => {
  let seen = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (!IGNORED_FOR_OVERLAP.test(value[index])) seen += 1;
    if (seen >= count) return value.slice(index + 1).replace(/^[\s、。，．,.]+/, '').trim();
  }
  return '';
};

export const mergeTranscriptChunk = (current: string, incoming: string) => {
  const previous = current.trim();
  const next = incoming.trim();
  if (!previous) return { transcript: next, addition: next };
  if (!next) return { transcript: previous, addition: '' };

  const normalizedPrevious = normalizeForOverlap(previous);
  const normalizedNext = normalizeForOverlap(next);
  if (normalizedPrevious.endsWith(normalizedNext)) return { transcript: previous, addition: '' };

  let overlap = 0;
  for (let length = Math.min(normalizedPrevious.length, normalizedNext.length); length >= 4; length -= 1) {
    if (normalizedPrevious.endsWith(normalizedNext.slice(0, length))) {
      overlap = length;
      break;
    }
  }

  const remainder = overlap ? sliceAfterComparableChars(next, overlap) : next;
  if (!remainder) return { transcript: previous, addition: '' };
  return {
    transcript: `${previous}${/[。！？.!?]$/.test(previous) ? '' : ' '}${remainder}`,
    addition: remainder,
  };
};

export const mergeTranscripts = (current: string, incoming: string) => (
  mergeTranscriptChunk(current, incoming).transcript
);

export { SAMPLE_RATE };
