export const createReazonWorker = () => new Worker(
  new URL('./reazonSpeech.worker.ts', import.meta.url),
);
