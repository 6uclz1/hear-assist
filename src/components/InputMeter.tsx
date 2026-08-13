type Props = { level: number; db: number | null; error: string };

export function InputMeter({ level, db, error }: Props) {
  const valueText = db === null ? '計測停止中' : `${db.toFixed(0)} dBFS`;
  return (
    <section className="meter-card" aria-labelledby="input-level-title">
      <div className="meter-heading">
        <h2 id="input-level-title">マイク入力</h2>
        <output>{db === null ? '—' : `${Math.round(level)} / 100 · ${db.toFixed(0)} dBFS`}</output>
      </div>
      <div className="meter-track" role="meter" aria-label="マイク入力レベル" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level)} aria-valuetext={valueText}>
        <div className="meter-fill" style={{ width: `${level}%` }} />
      </div>
      <div className="meter-scale" aria-hidden="true"><span>小さい</span><span>大きい</span></div>
      {error && <p className="inline-alert" role="alert">{error}</p>}
    </section>
  );
}
