import React, { useEffect, useRef, useState } from 'react';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import './SpeechRecognitionComponent.css'
import AutoScrollingText from './AutoScrollingText';

const isIOSDevice = () => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

const SpeechRecognitionComponent = () => {
  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable
  } = useSpeechRecognition();
  
  const displayRef :any = useRef(null);

  useEffect(() => {
    const scrollToBottom = () => {
      displayRef.current?.scrollTo(0, displayRef.current.scrollHeight);
    };

    scrollToBottom();
  }, [transcript]);

  const [selectedLanguage, setSelectedLanguage] = useState("ja-JP");
  const [showMicModeGuide, setShowMicModeGuide] = useState(false);
  const isIOS = isIOSDevice();

  const handleChange = (event: { target: { value: React.SetStateAction<string>; }; }) => {
    setSelectedLanguage(event.target.value);
  };
  
  if (!browserSupportsSpeechRecognition) {
    return <span>Browser doesn't support speech recognition.</span>;
  }

  if (!isMicrophoneAvailable) {
    return <span>Please enable microphone permission.</span>;
  }

  const startClick = async () => {
    if (!selectedLanguage) return;

    await SpeechRecognition.startListening({ continuous: true, language: selectedLanguage });

    if (isIOS) {
      setShowMicModeGuide(true);
    }
  };

  const stopClick = () => {
    SpeechRecognition.stopListening();
  };

  return (
    <div className="speech-recognition">
      🎙️：{listening ? '🔈' : '🔇'} 
      <button aria-label="音声認識を開始" onClick={startClick}>▶️</button>
      <button aria-label="音声認識を停止" onClick={stopClick}>■</button>
      <button aria-label="認識結果を消去" onClick={resetTranscript}>🗑️</button>
      <select aria-label="認識言語" value={selectedLanguage} onChange={handleChange}>
        <option value="">select language.</option>
        <option value="en-US">en</option>
        <option value="ja-JP">ja</option>
      </select>
      {isIOS && (
        <button className="mic-mode-help" onClick={() => setShowMicModeGuide(true)}>
          iPhoneマイク設定
        </button>
      )}
      {showMicModeGuide && (
        <aside className="mic-mode-guide" role="dialog" aria-labelledby="mic-mode-guide-title">
          <button
            className="mic-mode-guide-close"
            aria-label="マイク設定ガイドを閉じる"
            onClick={() => setShowMicModeGuide(false)}
          >
            ×
          </button>
          <h2 id="mic-mode-guide-title">周囲の声を拾う設定</h2>
          <p>音声認識を動かしたまま、次の順に設定してください。</p>
          <ol>
            <li>画面右上から下へスワイプして、コントロールセンターを開く</li>
            <li>上部のSafariまたはHear Assistのコントロールを開く</li>
            <li>「マイクモード」から「ワイドスペクトル」を選ぶ</li>
          </ol>
          <p className="mic-mode-guide-note">
            ワイドスペクトルが表示されない場合は「標準」を選んでください。
          </p>
          <a
            href="https://support.apple.com/ja-jp/101993"
            target="_blank"
            rel="noreferrer"
          >
            Appleの設定方法を見る
          </a>
        </aside>
      )}
      <div>
        <AutoScrollingText text={transcript} />
      </div>
    </div>
  );
};
export default SpeechRecognitionComponent;
