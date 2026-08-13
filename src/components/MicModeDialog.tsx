import { useId } from 'react';
import { CloseIcon } from './Icons';

export function MicModeDialog({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  return (
    <div className="dialog-backdrop">
      <dialog className="mic-dialog" open aria-labelledby={titleId} aria-modal="true">
        <button className="dialog-close" aria-label="マイク設定ガイドを閉じる" onClick={onClose}><CloseIcon /></button>
        <p className="eyebrow">iPhone</p><h2 id={titleId}>周囲の声を拾う設定</h2>
        <p>認識を動かしたままコントロールセンターを開き、次の順に設定します。</p>
        <ol><li>SafariまたはHear Assistのコントロールを開く</li><li>「マイクモード」を開く</li><li>「ワイドスペクトル」を選ぶ</li></ol>
        <p className="helper-text">表示されない場合は「標準」を選んでください。</p>
        <a href="https://support.apple.com/ja-jp/101993" target="_blank" rel="noreferrer">Appleの設定方法を見る</a>
      </dialog>
    </div>
  );
}
