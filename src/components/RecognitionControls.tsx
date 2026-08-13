import type { RecognitionMode, RecognitionSpan, RecognitionSpanConfig } from '../SpeechRecognitionComponent';

type Props = {
  active: boolean;
  mode: RecognitionMode;
  onModeChange: (mode: RecognitionMode) => void;
  language: string;
  onLanguageChange: (language: string) => void;
  span: RecognitionSpan;
  spans: Record<RecognitionSpan, RecognitionSpanConfig>;
  onSpanChange: (span: RecognitionSpan) => void;
  modelState: 'idle' | 'loading' | 'ready' | 'error';
  modelProgress: number;
  startDisabled: boolean;
  onStart: () => void;
  onStop: () => void;
  onClear: () => void;
};

export function RecognitionControls({
  active, mode, onModeChange, language, onLanguageChange, span, spans,
  onSpanChange, modelState, modelProgress, startDisabled, onStart, onStop, onClear,
}: Props) {
  const spanConfig = spans[span];
  const modelLabel = modelState === 'ready' ? '準備完了'
    : modelState === 'loading' ? `${Math.round(modelProgress)}%`
      : modelState === 'error' ? '読み込み失敗' : '初回約180MB';

  return (
    <section className="control-card" aria-labelledby="recognition-settings-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Recognition</p>
          <h2 id="recognition-settings-title">音声認識の設定</h2>
        </div>
        <span className={`status-badge ${active ? 'is-active' : ''}`} role="status">
          <span aria-hidden="true" />{active ? '認識中' : '停止中'}
        </span>
      </div>

      <div className="field-grid">
        <label className="field">
          <span>認識方式</span>
          <select value={mode} onChange={(event) => onModeChange(event.target.value as RecognitionMode)} disabled={active}>
            <option value="web-speech">Web Speech</option>
            <option value="reazon-speech">ReazonSpeech（端末内）</option>
          </select>
        </label>
        <label className="field">
          <span>言語</span>
          <select value={language} onChange={(event) => onLanguageChange(event.target.value)} disabled={active || mode === 'reazon-speech'}>
            <option value="ja-JP">日本語</option>
            <option value="en-US">English</option>
          </select>
        </label>
        {mode === 'reazon-speech' && (
          <label className="field field-wide">
            <span>字幕の更新速度</span>
            <select
              aria-label="字幕の更新速度"
              value={span}
              onChange={(event) => onSpanChange(event.target.value as RecognitionSpan)}
              disabled={active}
            >
              {Object.entries(spans).map(([value, config]) => (
                <option key={value} value={value}>{config.label}</option>
              ))}
            </select>
            <small>{spanConfig.windowSeconds}秒の音声を約{spanConfig.windowSeconds - spanConfig.overlapSeconds}秒間隔で処理します。</small>
          </label>
        )}
      </div>

      {mode === 'reazon-speech' && (
        <div className="model-progress" aria-label="ローカルモデルの状態">
          <div><span>日本語モデル</span><output>{modelLabel}</output></div>
          <progress max={100} value={modelProgress} aria-label={`モデル読み込み ${Math.round(modelProgress)}%`} />
          <p>音声は端末外へ送信しません。モデルは初回のみ取得します。</p>
        </div>
      )}

      <div className="primary-actions">
        <button className="button button-primary" onClick={onStart} disabled={active || startDisabled}>
          <span aria-hidden="true">▶</span>認識を開始
        </button>
        <button className="button button-secondary" onClick={onStop} disabled={!active}>
          <span aria-hidden="true">■</span>停止
        </button>
        <button className="button button-quiet" onClick={onClear}>
          <span aria-hidden="true">↺</span>字幕を消去
        </button>
      </div>
    </section>
  );
}
