import React, { useCallback, useEffect, useRef, useState } from 'react';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import './SpeechRecognitionComponent.css'
import AutoScrollingText from './AutoScrollingText';

type DiagnosticTone = 'idle' | 'listening' | 'success' | 'warning' | 'error';

type DiagnosticStatus = {
  tone: DiagnosticTone;
  message: string;
};

type DiagnosticLogEntry = {
  id: number;
  time: string;
  event: string;
  detail: string;
};

type RecognitionCycle = {
  heardSound: boolean;
  detectedSpeech: boolean;
  receivedResult: boolean;
};

const initialRecognitionCycle = (): RecognitionCycle => ({
  heardSound: false,
  detectedSpeech: false,
  receivedResult: false,
});

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
  const [diagnosticStatus, setDiagnosticStatus] = useState<DiagnosticStatus>({
    tone: 'idle',
    message: '開始すると音声認識の状態を診断します。',
  });
  const [diagnosticFinding, setDiagnosticFinding] = useState<DiagnosticStatus | null>(null);
  const [diagnosticLog, setDiagnosticLog] = useState<DiagnosticLogEntry[]>([]);
  const [heardSound, setHeardSound] = useState(false);
  const [detectedSpeech, setDetectedSpeech] = useState(false);
  const [receivedResult, setReceivedResult] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const meterAnimationFrameRef = useRef<number | null>(null);
  const lastMeterUpdateRef = useRef(0);
  const wasListeningRef = useRef(false);
  const recognitionCycleRef = useRef<RecognitionCycle>(initialRecognitionCycle());
  const diagnosticLogIdRef = useRef(0);
  const isIOS = isIOSDevice();

  const addDiagnosticLog = useCallback((event: string, detail: string) => {
    diagnosticLogIdRef.current += 1;
    const entry = {
      id: diagnosticLogIdRef.current,
      time: new Date().toLocaleTimeString('ja-JP', { hour12: false }),
      event,
      detail,
    };

    setDiagnosticLog((current) => [entry, ...current].slice(0, 20));
  }, []);

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

  useEffect(() => {
    const recognition = SpeechRecognition.getRecognition();
    if (!recognition) return;

    const resetCycle = () => {
      recognitionCycleRef.current = initialRecognitionCycle();
      setHeardSound(false);
      setDetectedSpeech(false);
      setReceivedResult(false);
      setDiagnosticStatus({
        tone: 'listening',
        message: '待機中です。音声入力を待っています。',
      });
      addDiagnosticLog('start', '音声認識セッションを開始');
    };

    const handleSoundStart = () => {
      recognitionCycleRef.current.heardSound = true;
      setHeardSound(true);
      setDiagnosticStatus({
        tone: 'listening',
        message: '音声入力を検出しました。発話判定を待っています。',
      });
      addDiagnosticLog('soundstart', 'マイクが音声入力を検出');
    };

    const handleSpeechStart = () => {
      recognitionCycleRef.current.detectedSpeech = true;
      setDetectedSpeech(true);
      setDiagnosticStatus({
        tone: 'listening',
        message: '発話として検出しました。認識結果を待っています。',
      });
      addDiagnosticLog('speechstart', '入力が発話として判定された');
    };

    const handleResult = () => {
      recognitionCycleRef.current.receivedResult = true;
      setReceivedResult(true);
      setDiagnosticStatus({
        tone: 'success',
        message: '認識結果を受信しました。',
      });
      addDiagnosticLog('result', '文字起こし結果を受信');
    };

    const handleNoMatch = () => {
      const { detectedSpeech: speechWasDetected } = recognitionCycleRef.current;
      const finding: DiagnosticStatus = {
        tone: 'warning',
        message: speechWasDetected
          ? '発話は検出されましたが、文字として認識できませんでした。'
          : '入力を文字として認識できませんでした。',
      };
      setDiagnosticStatus(finding);
      setDiagnosticFinding(finding);
      addDiagnosticLog('nomatch', '認識候補なし');
    };

    const handleError = (event: Event) => {
      const errorCode = (event as SpeechRecognitionErrorEvent).error || 'unknown';
      setDiagnosticStatus({
        tone: 'error',
        message: `音声認識エラー: ${errorCode}`,
      });
      addDiagnosticLog('error', errorCode);
    };

    const handleEnd = () => {
      const cycle = recognitionCycleRef.current;

      if (cycle.heardSound && !cycle.detectedSpeech) {
        const finding: DiagnosticStatus = {
          tone: 'warning',
          message: '音は届いていますが、発話として判定されませんでした。',
        };
        setDiagnosticStatus(finding);
        setDiagnosticFinding(finding);
        addDiagnosticLog('diagnosis', '入力音あり・発話判定なし');
      } else if (cycle.detectedSpeech && !cycle.receivedResult) {
        const finding: DiagnosticStatus = {
          tone: 'warning',
          message: '発話は検出されましたが、認識結果が返りませんでした。',
        };
        setDiagnosticStatus(finding);
        setDiagnosticFinding(finding);
        addDiagnosticLog('diagnosis', '発話判定あり・認識結果なし');
      } else if (!cycle.heardSound) {
        setDiagnosticStatus({
          tone: 'idle',
          message: 'このセッションでは音声入力を検出しませんでした。',
        });
        addDiagnosticLog('end', '音声入力なしでセッション終了');
      } else {
        addDiagnosticLog('end', '音声認識セッションを終了');
      }
    };

    recognition.addEventListener('start', resetCycle);
    recognition.addEventListener('soundstart', handleSoundStart);
    recognition.addEventListener('speechstart', handleSpeechStart);
    recognition.addEventListener('result', handleResult);
    recognition.addEventListener('nomatch', handleNoMatch);
    recognition.addEventListener('error', handleError);
    recognition.addEventListener('end', handleEnd);

    return () => {
      recognition.removeEventListener('start', resetCycle);
      recognition.removeEventListener('soundstart', handleSoundStart);
      recognition.removeEventListener('speechstart', handleSpeechStart);
      recognition.removeEventListener('result', handleResult);
      recognition.removeEventListener('nomatch', handleNoMatch);
      recognition.removeEventListener('error', handleError);
      recognition.removeEventListener('end', handleEnd);
    };
  }, [addDiagnosticLog]);
  
  if (!browserSupportsSpeechRecognition) {
    return <span>Browser doesn't support speech recognition.</span>;
  }

  if (!isMicrophoneAvailable) {
    return <span>Please enable microphone permission.</span>;
  }

  const startClick = async () => {
    if (!selectedLanguage) return;

    setDiagnosticLog([]);
    setDiagnosticFinding(null);
    setDiagnosticStatus({
      tone: 'listening',
      message: '音声認識を起動しています。',
    });

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
      <section className="recognition-diagnostics" aria-label="音声認識診断">
        <div className="recognition-diagnostics-header">
          <span>認識診断</span>
          <span className={`diagnostic-status diagnostic-status-${diagnosticStatus.tone}`}>
            {diagnosticStatus.message}
          </span>
        </div>
        <div className="diagnostic-steps" aria-label="認識処理の進行状況">
          <span className={heardSound ? 'is-detected' : ''}>
            <b>1</b> 入力音
          </span>
          <span aria-hidden="true">→</span>
          <span className={detectedSpeech ? 'is-detected' : ''}>
            <b>2</b> 発話判定
          </span>
          <span aria-hidden="true">→</span>
          <span className={receivedResult ? 'is-detected' : ''}>
            <b>3</b> 認識結果
          </span>
        </div>
        {diagnosticFinding && (
          <p className={`diagnostic-finding diagnostic-status-${diagnosticFinding.tone}`}>
            <b>直近の判定：</b>{diagnosticFinding.message}
          </p>
        )}
        <details className="diagnostic-log">
          <summary>イベントログ（直近20件）</summary>
          {diagnosticLog.length === 0 ? (
            <p>まだイベントはありません。</p>
          ) : (
            <ol aria-label="音声認識イベントログ">
              {diagnosticLog.map((entry) => (
                <li key={entry.id}>
                  <time>{entry.time}</time>
                  <code>{entry.event}</code>
                  <span>{entry.detail}</span>
                </li>
              ))}
            </ol>
          )}
        </details>
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
