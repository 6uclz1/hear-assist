import React, { useState, useRef, useEffect } from "react";

const AutoScrollingText: React.FC<{ text: string }> = ({ text }) => {
  const [displayText, setDisplayText] = useState<string>(text);
  const displayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDisplayText(text)
  }, [text]);

  useEffect(() => {
    const scrollToBottom = () => {
      displayRef.current?.scrollTo(0, displayRef.current.scrollHeight);
    };

    scrollToBottom();
  }, [displayText]);

  const [fontSize, setFontSize] = useState<number>(16);

  const handleFontSizeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFontSize(Number(event.target.value));
  };

  const style: React.CSSProperties = {
    fontSize: `${fontSize*4}px`,
    fontWeight: "bold",
    overflowY: "scroll",
    height: "480px",
  };

  return (
    <>
      <div>
        🔍<input type="range" min="10" max="30" value={fontSize} onChange={handleFontSizeChange} />
      </div>
      <div
        ref={displayRef}
        style={style}
      >
      {displayText}
      </div>
    </>
  );
};

export default AutoScrollingText;