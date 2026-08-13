import React, { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import './AutoScrollingText.css';

type AutoScrollingTextProps = {
  text: string;
  highlightedText?: string;
  listening?: boolean;
};

const splitHighlightedSuffix = (text: string, highlightedText: string) => {
  const highlight = highlightedText.trim();
  if (!highlight || !text.trimEnd().endsWith(highlight)) return { history: text, highlight: '' };

  const end = text.trimEnd();
  return {
    history: end.slice(0, end.length - highlight.length).trimEnd(),
    highlight,
  };
};

const AutoScrollingText: React.FC<AutoScrollingTextProps> = ({
  text,
  highlightedText = '',
  listening = false,
}) => {
  const [fontSize, setFontSize] = useState(56);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const displayRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLElement>(null);
  const parts = useMemo(
    () => splitHighlightedSuffix(text, highlightedText),
    [highlightedText, text],
  );

  const scrollToLatest = useEffectEvent(() => {
    displayRef.current?.scrollTo({ top: displayRef.current.scrollHeight, behavior: 'smooth' });
  });

  useEffect(() => {
    scrollToLatest();
  }, [text]);

  useEffect(() => {
    if (!isFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsFullscreen(false);
    };
    document.addEventListener('keydown', closeWithEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeWithEscape);
    };
  }, [isFullscreen]);

  useEffect(() => {
    const syncFullscreenState = () => {
      if (!document.fullscreenElement) setIsFullscreen(false);
    };
    document.addEventListener('fullscreenchange', syncFullscreenState);
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState);
  }, []);

  const openFullscreen = async () => {
    setIsFullscreen(true);
    try {
      await viewerRef.current?.requestFullscreen?.();
    } catch {
      // The CSS fullscreen presentation remains available on iOS WebKit.
    }
  };

  const closeFullscreen = async () => {
    setIsFullscreen(false);
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
  };

  return (
    <section
      ref={viewerRef}
      className={`subtitle-viewer${isFullscreen ? ' is-fullscreen' : ''}`}
      aria-label="文字起こし表示"
    >
      <header className="subtitle-toolbar">
        <label>
          <span aria-hidden="true">文字サイズ</span>
          <input
            aria-label="字幕の文字サイズ"
            type="range"
            min="28"
            max="96"
            step="4"
            value={fontSize}
            onChange={(event) => setFontSize(Number(event.target.value))}
          />
        </label>
        <span className={`subtitle-listening${listening ? ' is-active' : ''}`}>
          {listening ? '● 認識中' : '○ 停止中'}
        </span>
        <button type="button" onClick={isFullscreen ? closeFullscreen : openFullscreen}>
          {isFullscreen ? '全面表示を閉じる' : '全面表示'}
        </button>
      </header>
      <div
        ref={displayRef}
        className="subtitle-scroll"
        style={{ '--subtitle-font-size': `${fontSize}px` } as React.CSSProperties}
        aria-live="polite"
      >
        {!text && <span className="subtitle-placeholder">認識した字幕がここに表示されます</span>}
        {parts.history && <span className="subtitle-history">{parts.history} </span>}
        {parts.highlight && <mark className="subtitle-highlight">{parts.highlight}</mark>}
      </div>
    </section>
  );
};

export default AutoScrollingText;
