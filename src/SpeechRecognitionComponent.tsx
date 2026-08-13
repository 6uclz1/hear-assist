import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [volumeDb, setVolumeDb] = useState<number | null>(null);
  const [meterError, setMeterError] = useState('');
  const audioContextRef = useRef<AudioContext | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const meterAnimationFrameRef = useRef<number | null>(null);
  const lastMeterUpdateRef = useRef(0);
  const wasListeningRef = useRef(false);
  const isIOS = isIOSDevice();

  const handleChange = (event: { target: { value: React.SetStateAction<string>; }; }) => {
    setSelectedLanguage(event.target.value);
  };

  const stopVolumeMeter = useCallback(() => {
    if (meterAnimationFrameRef.current !== null) {
      cancelAnimationFrame(meterAnimationFrameRef.current);
      meterAnimationFrameRef.current = null;
    }

    microphoneStreamRef.current?.getTracks().forEach((track) => track.stop());
    microphoneStreamRef.current = null;

    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setVolumeLevel(0);
    setVolumeDb(null);
  }, []);

  const startVolumeMeter = useCallback(async () => {
    if (microphoneStreamRef.current) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setMeterError('このブラウザでは入力レベルを取得できません。');
      return;
    }

    try {
      setMeterError('');
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const streamPromise = navigator.mediaDevices.getUserMedia({ audio: true });
      const [, stream] = await Promise.all([audioContext.resume(), streamPromise]);
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);

      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.8;
      const samples = new Float32Array(analyser.fftSize);
      source.connect(analyser);

      microphoneStreamRef.current = stream;

      const updateMeter = (timestamp: number) => {
        if (timestamp - lastMeterUpdateRef.current >= 100) {
          analyser.getFloatTimeDomainData(samples);

          let sumSquares = 0;
          for (let index = 0; index < samples.length; index += 1) {
            const sample = samples[index];
            sumSquares += sample * sample;
          }

          const rms = Math.sqrt(sumSquares / samples.length);
          const db = Math.max(-60, 20 * Math.log10(Math.max(rms, 0.001)));
          const level = Math.min(100, Math.max(0, ((db + 60) / 60) * 100));

          setVolumeDb(db);
          setVolumeLevel(level);
          lastMeterUpdateRef.current = timestamp;
        }

        meterAnimationFrameRef.current = requestAnimationFrame(updateMeter);
      };

      meterAnimationFrameRef.current = requestAnimationFrame(updateMeter);
    } catch {
      stopVolumeMeter();
      setMeterError('マイクの入力レベルを取得できませんでした。');
    }
  }, [stopVolumeMeter]);

  useEffect(() => {
    if (listening) {
      wasListeningRef.current = true;
    } else if (wasListeningRef.current) {
      wasListeningRef.current = false;
      stopVolumeMeter();
    }
  }, [listening, stopVolumeMeter]);

  useEffect(() => stopVolumeMeter, [stopVolumeMeter]);
  
  if (!browserSupportsSpeechRecognition) {
    return <span>Browser doesn't support speech recognition.</span>;
  }

  if (!isMicrophoneAvailable) {
    return <span>Please enable microphone permission.</span>;
  }

  const startClick = async () => {
    if (!selectedLanguage) return;

    const recognitionStart = SpeechRecognition.startListening({
      continuous: true,
      language: selectedLanguage,
    });
    void startVolumeMeter();
    await recognitionStart;

    if (isIOS) {
      setShowMicModeGuide(true);
    }
  };

  const stopClick = () => {
    SpeechRecognition.stopListening();
    stopVolumeMeter();
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
      <section className="volume-meter" aria-label="マイク入力レベル">
        <div className="volume-meter-header">
          <span>入力レベル</span>
          <output>
            {volumeDb === null
              ? '--'
              : `${Math.round(volumeLevel)} / 100 (${volumeDb.toFixed(0)} dBFS)`}
          </output>
        </div>
        <div
          className="volume-meter-track"
          role="meter"
          aria-label="マイク入力レベル"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(volumeLevel)}
          aria-valuetext={volumeDb === null ? '計測停止中' : `${volumeDb.toFixed(0)} dBFS`}
        >
          <div className="volume-meter-fill" style={{ width: `${volumeLevel}%` }} />
        </div>
        <div className="volume-meter-scale" aria-hidden="true">
          <span>小</span>
          <span>大</span>
        </div>
        {meterError && <p className="volume-meter-error">{meterError}</p>}
      </section>
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
