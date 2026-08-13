import React, { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import type { SubtitleContrast, SubtitleFocus } from './SpeechRecognitionComponent';
import { CollapseIcon, ExpandIcon, MicrophoneIcon, MinusIcon, PlusIcon, SettingsIcon, StopIcon, TrashIcon } from './components/Icons';
import './AutoScrollingText.css';

export type CaptionStatus = {
  tone: 'stopped' | 'starting' | 'live' | 'delayed' | 'interrupted' | 'error';
  label: string;
  detail: string;
};

type Props = {
  text: string;
  highlightedText?: string;
  active?: boolean;
  status?: CaptionStatus;
  lastRecognitionLabel?: string;
  contrast?: SubtitleContrast;
  focus?: SubtitleFocus;
  lineHeight?: number;
  startDisabled?: boolean;
  onStart?: () => void;
  onStop?: () => void;
  onClear?: () => void;
  onOpenSettings?: () => void;
};

const splitHighlightedSuffix = (text: string, highlightedText: string) => {
  const highlight = highlightedText.trim();
  if (!highlight || !text.trimEnd().endsWith(highlight)) return { history: text, highlight: '' };
  const end = text.trimEnd();
  return { history: end.slice(0, end.length - highlight.length).trimEnd(), highlight };
};

const takeTail = (text: string, maxCharacters: number) => {
  if (text.length <= maxCharacters) return text;
  const tail = text.slice(-maxCharacters);
  const boundary = tail.search(/[。！？.!?\s]/u);
  return `…${boundary >= 0 ? tail.slice(boundary + 1) : tail}`;
};

const focusParts = (text: string, highlightedText: string, focus: SubtitleFocus) => {
  const parts = splitHighlightedSuffix(text, highlightedText);
  if (focus === 'history') return parts;
  if (focus === 'one') return parts.highlight ? { history: '', highlight: parts.highlight } : { history: takeTail(parts.history, 48), highlight: '' };
  return { history: takeTail(parts.history, parts.highlight ? 64 : 112), highlight: parts.highlight };
};

const AutoScrollingText: React.FC<Props> = ({
  text, highlightedText = '', active = false,
  status = { tone: 'stopped', label: '停止中', detail: '開始ボタンを押してください' },
  lastRecognitionLabel = 'まだありません', contrast = 'dark', focus = 'two', lineHeight = 1.5,
  startDisabled = false, onStart, onStop, onClear, onOpenSettings,
}) => {
  const [fontSize, setFontSize] = useState(64);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const displayRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLElement>(null);
  const parts = useMemo(() => focusParts(text, highlightedText, focus), [focus, highlightedText, text]);

  const scrollToLatest = useEffectEvent(() => displayRef.current?.scrollTo({ top: displayRef.current.scrollHeight, behavior: 'smooth' }));
  useEffect(() => { scrollToLatest(); }, [text]);
  useEffect(() => {
    if (!isFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeWithEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setIsFullscreen(false); };
    document.addEventListener('keydown', closeWithEscape);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', closeWithEscape); };
  }, [isFullscreen]);
  useEffect(() => {
    const syncFullscreenState = () => { if (!document.fullscreenElement) setIsFullscreen(false); };
    document.addEventListener('fullscreenchange', syncFullscreenState);
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState);
  }, []);

  const toggleFullscreen = async () => {
    if (isFullscreen) {
      setIsFullscreen(false);
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
      return;
    }
    setIsFullscreen(true);
    await viewerRef.current?.requestFullscreen?.().catch(() => undefined);
  };
  const changeFontSize = (change: number) => setFontSize((current) => Math.min(112, Math.max(32, current + change)));

  return (
    <section ref={viewerRef} className={`caption-stage contrast-${contrast}${isFullscreen ? ' is-fullscreen' : ''}`} aria-label="文字起こし表示">
      <header className="caption-statusbar">
        <div className={`live-state state-${status.tone}`} role="status" aria-live="polite">
          <span className="state-dot" aria-hidden="true" />
          <span><strong>{status.label}</strong><small>{status.detail}</small></span>
        </div>
        <div className="last-caption-time"><span>最終認識</span><strong>{lastRecognitionLabel}</strong></div>
        <button className="stage-tool settings-tool" type="button" onClick={onOpenSettings}><SettingsIcon /><span>設定</span></button>
      </header>
      {(status.tone === 'delayed' || status.tone === 'interrupted' || status.tone === 'error') && <div className={`stage-alert alert-${status.tone}`} role="alert"><strong>{status.label}</strong><span>{status.detail}</span></div>}
      <div ref={displayRef} className={`caption-canvas focus-${focus}`} style={{ '--subtitle-font-size': `${fontSize}px`, '--subtitle-line-height': lineHeight } as React.CSSProperties} aria-live="polite" aria-atomic="false">
        {!text && <div className="caption-empty"><MicrophoneIcon /><strong>会話が字幕になります</strong><span>{active ? '音声を待っています' : '下のボタンを押して開始してください'}</span></div>}
        {text && <div className="caption-text">{parts.history && <span className="subtitle-history">{parts.history} </span>}{parts.highlight && <mark className="subtitle-highlight">{parts.highlight}</mark>}</div>}
      </div>
      <footer className="caption-controls">
        <div className="view-tools" aria-label="字幕表示の操作">
          <button className="stage-tool" type="button" aria-label="文字を小さく" onClick={() => changeFontSize(-8)}><MinusIcon /><span>文字</span></button>
          <output aria-live="polite">{fontSize}</output>
          <button className="stage-tool" type="button" aria-label="文字を大きく" onClick={() => changeFontSize(8)}><PlusIcon /><span>文字</span></button>
        </div>
        <button className={`listen-button${active ? ' is-stopping' : ''}`} type="button" disabled={!active && startDisabled} onClick={active ? onStop : onStart}>
          {active ? <StopIcon /> : <MicrophoneIcon />}<span>{active ? '字幕を停止' : '字幕を開始'}</span>
        </button>
        <div className="secondary-tools">
          <button className="stage-tool" type="button" onClick={toggleFullscreen}>{isFullscreen ? <CollapseIcon /> : <ExpandIcon />}<span>{isFullscreen ? '閉じる' : '全面'}</span></button>
          <button className="stage-tool" type="button" onClick={onClear} disabled={!text}><TrashIcon /><span>消去</span></button>
        </div>
      </footer>
    </section>
  );
};

export default AutoScrollingText;
