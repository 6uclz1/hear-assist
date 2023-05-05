import React, { useEffect, useRef } from 'react';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import './SpeechRecognitionComponent.css'
import AutoScrollingText from './AutoScrollingText';

const SpeechRecognitionComponent = () => {
  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition
  } = useSpeechRecognition();
  
  const displayRef :any = useRef(null);

  useEffect(() => {
    const scrollToBottom = () => {
      displayRef.current?.scrollTo(0, displayRef.current.scrollHeight);
    };

    scrollToBottom();
  }, [transcript]);
  
  if (!browserSupportsSpeechRecognition) {
    return <span>Browser doesn't support speech recognition.</span>;
  }

  const startClick = () => {
    SpeechRecognition.startListening({ continuous: true });
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
      {/* <div ref={displayRef} className='text'>{transcript}</div> */}
      <div>
        <AutoScrollingText text={transcript} />
      </div>
    </div>
  );
};
export default SpeechRecognitionComponent;