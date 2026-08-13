import { useEffect, useId, useRef } from 'react';
import type { RecognitionMode, RecognitionSpan, RecognitionSpanConfig, SubtitleContrast, SubtitleFocus } from '../SpeechRecognitionComponent';
import { ChevronDownIcon, CloseIcon, MicrophoneIcon } from './Icons';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import { InputMeter } from './InputMeter';
import type { DiagnosticLogEntry, DiagnosticStatus } from '../SpeechRecognitionComponent';

type Props = {
  active: boolean;
  mode: RecognitionMode;
  onModeChange: (mode: RecognitionMode) => void;
  language: string;
  onLanguageChange: (language: string) => void;
  span: RecognitionSpan;
  spans: Record<RecognitionSpan, RecognitionSpanConfig>;
  onSpanChange: (span: RecognitionSpan) => void;
  contrast: SubtitleContrast;
  onContrastChange: (contrast: SubtitleContrast) => void;
  focus: SubtitleFocus;
  onFocusChange: (focus: SubtitleFocus) => void;
  lineHeight: number;
  onLineHeightChange: (lineHeight: number) => void;
  modelState: 'idle' | 'loading' | 'ready' | 'error';
  modelProgress: number;
  meter: { level: number; rms: number | null; db: number | null; error: string };
  diagnostics: {
    status: DiagnosticStatus;
    finding: DiagnosticStatus | null;
    pendingCount: number;
    steps: [boolean, boolean, boolean];
    labels: string[];
    logs: DiagnosticLogEntry[];
  };
  onClose: () => void;
  onOpenMicGuide?: () => void;
};

export function SettingsDialog({ active, mode, onModeChange, language, onLanguageChange, span, spans, onSpanChange, contrast, onContrastChange, focus, onFocusChange, lineHeight, onLineHeightChange, modelState, modelProgress, meter, diagnostics, onClose, onOpenMicGuide }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const modelLabel = modelState === 'ready' ? 'オフライン準備完了'
    : modelState === 'loading' ? `取得中 ${Math.round(modelProgress)}%`
      : modelState === 'error' ? '読み込みに失敗しました' : '初回のみ約180MB取得します';

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    const cancel = (event: Event) => { event.preventDefault(); onClose(); };
    dialog.addEventListener('cancel', cancel);
    return () => {
      dialog.removeEventListener('cancel', cancel);
      dialog.close();
    };
  }, [onClose]);

  const spanConfig = spans[span];
  return (
    <dialog ref={dialogRef} className="settings-dialog" aria-labelledby={titleId}>
      <header className="settings-header">
        <div><p>Hear Assist</p><h2 id={titleId}>設定</h2></div>
        <button className="icon-button" type="button" aria-label="設定を閉じる" onClick={onClose}><CloseIcon /></button>
      </header>

      <div className="settings-body">
        <section className="settings-section" aria-labelledby="recognition-title">
          <div className="settings-section-heading"><span>1</span><div><h3 id="recognition-title">音声認識</h3><p>通常は端末内認識のままで利用できます。</p></div></div>
          <div className="settings-grid">
            <label className="modern-field"><span>認識方式</span><span className="select-shell"><select value={mode} onChange={(event) => onModeChange(event.target.value as RecognitionMode)} disabled={active}><option value="reazon-speech">端末内認識（おすすめ）</option><option value="web-speech">Web Speech</option></select><ChevronDownIcon /></span></label>
            <label className="modern-field"><span>言語</span><span className="select-shell"><select value={language} onChange={(event) => onLanguageChange(event.target.value)} disabled={active || mode === 'reazon-speech'}><option value="ja-JP">日本語</option><option value="en-US">English</option></select><ChevronDownIcon /></span></label>
            {mode === 'reazon-speech' && <label className="modern-field settings-wide"><span>字幕の更新速度</span><span className="select-shell"><select aria-label="字幕の更新速度" value={span} onChange={(event) => onSpanChange(event.target.value as RecognitionSpan)} disabled={active}>{Object.entries(spans).map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}</select><ChevronDownIcon /></span><small>{spanConfig.windowSeconds}秒の音声を約{spanConfig.windowSeconds - spanConfig.overlapSeconds}秒間隔で処理します。</small></label>}
          </div>
          {mode === 'reazon-speech' && <div className={`model-readiness state-${modelState}`} aria-label="ローカルモデルの状態"><div><strong>日本語オフラインモデル</strong><output>{modelLabel}</output></div><progress max="100" value={modelProgress} aria-label={`モデル読み込み ${Math.round(modelProgress)}%`} /><p>音声は端末外へ送信しません。</p></div>}
        </section>

        <section className="settings-section" aria-labelledby="caption-style-title">
          <div className="settings-section-heading"><span>2</span><div><h3 id="caption-style-title">字幕の見え方</h3><p>見やすい配色と表示量を選べます。</p></div></div>
          <fieldset className="choice-field"><legend>配色</legend><div className="choice-grid contrast-options">{([['dark', '黒', '白い文字'], ['light', '白', '黒い文字'], ['yellow', '黒', '黄色い文字']] as const).map(([value, label, detail]) => <button key={value} type="button" aria-pressed={contrast === value} className={`appearance-choice preview-${value}`} onClick={() => onContrastChange(value)}><span className="appearance-swatch">あ</span><span><strong>{label}</strong><small>{detail}</small></span></button>)}</div></fieldset>
          <fieldset className="choice-field"><legend>表示する字幕</legend><div className="segmented-control">{([['one', '最新1行'], ['two', '最新2行'], ['history', 'すべて']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={focus === value} onClick={() => onFocusChange(value)}>{label}</button>)}</div></fieldset>
          <div className="range-field"><span><strong>行間</strong><output>{lineHeight.toFixed(1)}</output></span><input aria-label="字幕の行間" type="range" min="1.2" max="2" step="0.1" value={lineHeight} onChange={(event) => onLineHeightChange(Number(event.target.value))} /></div>
        </section>

        <details className="advanced-panel">
          <summary>入力と認識の診断</summary>
          <div className="advanced-content"><InputMeter {...meter} /><DiagnosticsPanel mode={mode} {...diagnostics} /></div>
        </details>
        {onOpenMicGuide && <button className="mic-guide-button" type="button" onClick={onOpenMicGuide}><MicrophoneIcon /><span><strong>iPhoneのマイク設定</strong><small>周囲の声を拾うための設定方法を確認</small></span></button>}
      </div>
      <footer className="settings-footer"><button className="button button-primary" type="button" onClick={onClose}>設定を保存して戻る</button></footer>
    </dialog>
  );
}
