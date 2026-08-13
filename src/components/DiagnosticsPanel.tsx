import type { DiagnosticLogEntry, DiagnosticStatus, RecognitionMode } from '../SpeechRecognitionComponent';

type Props = {
  mode: RecognitionMode;
  status: DiagnosticStatus;
  finding: DiagnosticStatus | null;
  pendingCount: number;
  steps: [boolean, boolean, boolean];
  labels: string[];
  logs: DiagnosticLogEntry[];
};

export function DiagnosticsPanel({ mode, status, finding, pendingCount, steps, labels, logs }: Props) {
  return (
    <section className="diagnostics-card" aria-labelledby="diagnostics-title">
      <div className="section-heading compact">
        <div><p className="eyebrow">Diagnostics</p><h2 id="diagnostics-title">認識状態</h2></div>
        {mode === 'reazon-speech' && pendingCount > 0 && <span className="queue-badge">待機 {pendingCount}件</span>}
      </div>
      <p className={`diagnostic-message tone-${status.tone}`} role="status" aria-live="polite">{status.message}</p>
      <ol className="diagnostic-steps" aria-label="認識処理の進行状況">
        {labels.map((label, index) => <li key={label} className={steps[index] ? 'is-complete' : ''}><span>{index + 1}</span>{label}</li>)}
      </ol>
      {mode === 'web-speech' && <p className="helper-text">iOSでは入力音通知が省略されることがあります。発話判定か認識結果が届けば入力されています。</p>}
      {finding && <p className={`finding tone-${finding.tone}`}><strong>直近の判定</strong>{finding.message}</p>}
      <details className="event-log">
        <summary>イベントログ <span>{logs.length}件</span></summary>
        {logs.length === 0 ? <p>まだイベントはありません。</p> : (
          <ol>{logs.map((entry) => <li key={entry.id}><time>{entry.time}</time><code>{entry.event}</code><span>{entry.detail}</span></li>)}</ol>
        )}
      </details>
    </section>
  );
}
