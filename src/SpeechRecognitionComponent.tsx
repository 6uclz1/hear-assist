import React, { useEffect, useRef, useState } from 'react';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import './SpeechRecognitionComponent.css'
import AutoScrollingText from './AutoScrollingText';

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

  const [selectedLanguage, setSelectedLanguage] = useState("");

  const handleChange = (event: { target: { value: React.SetStateAction<string>; }; }) => {
    setSelectedLanguage(event.target.value);
  };
  
  if (!browserSupportsSpeechRecognition) {
    return <span>Browser doesn't support speech recognition.</span>;
  }

  if (!isMicrophoneAvailable) {
    return <span>Please enable microphone permission.</span>;
  }

  const startClick = () => {
    if (selectedLanguage != null || selectedLanguage !== '') {
      SpeechRecognition.startListening({ continuous: true, language: selectedLanguage });
    }
  };

  const stopClick = () => {
    SpeechRecognition.stopListening();
  };

  return (
    <div>
      🎙️：{listening ? '🔈' : '🔇'} 
      <button onClick={startClick}>▶️</button>
      <button onClick={stopClick}>■</button>
      <button onClick={resetTranscript}>🗑️</button>
      <select value={selectedLanguage} onChange={handleChange}>
        <option value="">select language.</option>
        <option value="en-US">en</option>
        <option value="ja">ja</option>
      </select>
      <div>
        <AutoScrollingText text={transcript} />
      </div>
    </div>
  );
};
export default SpeechRecognitionComponent;