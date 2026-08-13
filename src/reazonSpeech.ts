const SAMPLE_RATE = 16_000;

export const downsampleAudio = (input: Float32Array, inputRate: number) => {
  if (inputRate === SAMPLE_RATE) return new Float32Array(input);
  const ratio = inputRate / SAMPLE_RATE;
  const output = new Float32Array(Math.round(input.length / ratio));

  for (let index = 0; index < output.length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(input.length, Math.floor((index + 1) * ratio));
    let sum = 0;
    for (let sourceIndex = start; sourceIndex < end; sourceIndex += 1) sum += input[sourceIndex];
    output[index] = sum / Math.max(1, end - start);
  }
  return output;
};

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

const sliceAfterNonWhitespace = (value: string, count: number) => {
  let seen = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (!/\s/.test(value[index])) seen += 1;
    if (seen >= count) return value.slice(index + 1).trim();
  }
  return '';
};

export const mergeTranscriptChunk = (current: string, incoming: string) => {
  const previous = current.trim();
  const next = incoming.trim();
  if (!previous) return { transcript: next, addition: next };
  if (!next) return { transcript: previous, addition: '' };

  const normalizedPrevious = previous.replace(/\s/g, '');
  const normalizedNext = next.replace(/\s/g, '');
  if (normalizedPrevious.endsWith(normalizedNext)) return { transcript: previous, addition: '' };

  let overlap = 0;
  for (let length = Math.min(normalizedPrevious.length, normalizedNext.length); length >= 4; length -= 1) {
    if (normalizedPrevious.endsWith(normalizedNext.slice(0, length))) {
      overlap = length;
      break;
    }
  }

  const remainder = overlap ? sliceAfterNonWhitespace(next, overlap) : next;
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
