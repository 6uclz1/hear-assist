export type LocalModel = 'reazonspeech' | 'haas';

export type LocalModelConfig = {
  label: string;
  name: string;
  downloadSize: string;
};

export const LOCAL_MODELS: Record<LocalModel, LocalModelConfig> = {
  reazonspeech: { label: '標準（ReazonSpeech）', name: 'ReazonSpeech', downloadSize: '約180MB' },
  haas: { label: '高精度（Haas）', name: 'Haas', downloadSize: '約480MB' },
};

export const isLocalModel = (value: unknown): value is LocalModel => typeof value === 'string' && value in LOCAL_MODELS;
