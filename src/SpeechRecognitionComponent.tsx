import React, { useCallback, useEffect, useRef, useState } from 'react';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import './SpeechRecognitionComponent.css'
import AutoScrollingText from './AutoScrollingText';
import { createReazonWorker } from './createReazonWorker';
import { downsampleAudio, joinAudioChunks, keepLastSamples, mergeTranscripts, SAMPLE_RATE } from './reazonSpeech';

type RecognitionMode = 'web-speech' | 'reazon-speech';
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

type ReazonWorkerMessage = {
  type: 'progress' | 'ready' | 'result' | 'error';
  loaded?: number;
  total?: number;
  id?: number;
  text?: string;
  message?: string;
};

const WINDOW_SAMPLES = SAMPLE_RATE * 10;
const OVERLAP_SAMPLES = SAMPLE_RATE * 2;

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
  
  const displayRef = useRef<HTMLDivElement | null>(null);

  const [recognitionMode, setRecognitionMode] = useState<RecognitionMode>('web-speech');
  const [reazonTranscript, setReazonTranscript] = useState('');
  const [reazonListening, setReazonListening] = useState(false);
  const [reazonModelState, setReazonModelState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [reazonProgress, setReazonProgress] = useState(0);
  const [reazonPendingCount, setReazonPendingCount] = useState(0);
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
  const reazonWorkerRef = useRef<Worker | null>(null);
  const reazonInitializationRef = useRef<Promise<void> | null>(null);
  const reazonInitializationHandlersRef = useRef<{ resolve: () => void; reject: (error: Error) => void } | null>(null);
  const reazonProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const reazonSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const reazonSilentGainRef = useRef<GainNode | null>(null);
  const reazonChunksRef = useRef<Float32Array[]>([]);
  const reazonSampleCountRef = useRef(0);
  const reazonRequestIdRef = useRef(0);
  const nextReazonResultRef = useRef(0);
  const reazonResultsRef = useRef(new Map<number, string | null>());
  const isIOS = isIOSDevice();
  const isActive = recognitionMode === 'reazon-speech' ? reazonListening : listening;
  const displayedTranscript = recognitionMode === 'reazon-speech' ? reazonTranscript : transcript;

  useEffect(() => {
    displayRef.current?.scrollTo(0, displayRef.current.scrollHeight);
  }, [displayedTranscript]);

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

  const flushReazonResults = useCallback(() => {
    while (reazonResultsRef.current.has(nextReazonResultRef.current)) {
      const text = reazonResultsRef.current.get(nextReazonResultRef.current);
      reazonResultsRef.current.delete(nextReazonResultRef.current);
      nextReazonResultRef.current += 1;
      if (text) setReazonTranscript((current) => mergeTranscripts(current, text));
    }
  }, []);

  const initializeReazonSpeech = useCallback(() => {
    if (reazonModelState === 'ready' && reazonWorkerRef.current) return Promise.resolve();
    if (reazonInitializationRef.current) return reazonInitializationRef.current;

    setReazonModelState('loading');
    setReazonProgress(0);
    const initialization = new Promise<void>((resolve, reject) => {
      reazonInitializationHandlersRef.current = { resolve, reject };
    });
    reazonInitializationRef.current = initialization;

    const worker = createReazonWorker();
    reazonWorkerRef.current = worker;
    worker.addEventListener('message', (event: MessageEvent<ReazonWorkerMessage>) => {
      const message = event.data;
      if (message.type === 'progress') {
        setReazonProgress(message.total ? Math.min(100, (Number(message.loaded) / message.total) * 100) : 0);
      } else if (message.type === 'ready') {
        setReazonModelState('ready');
        setReazonProgress(100);
        addDiagnosticLog('model', 'ReazonSpeechモデルの準備完了');
        reazonInitializationHandlersRef.current?.resolve();
        reazonInitializationHandlersRef.current = null;
      } else if (message.type === 'result' && message.id !== undefined) {
        setReazonPendingCount((count) => Math.max(0, count - 1));
        if (message.id < nextReazonResultRef.current) return;
        reazonResultsRef.current.set(message.id, message.text?.trim() || null);
        if (message.text) {
          setReceivedResult(true);
          setDiagnosticStatus({ tone: 'success', message: 'ReazonSpeechの認識結果を受信しました。' });
        }
        addDiagnosticLog('result', message.text ? `チャンク ${message.id + 1} の認識結果` : '認識結果なし');
        flushReazonResults();
      } else if (message.type === 'error') {
        const error = new Error(message.message || 'ReazonSpeechの初期化に失敗しました。');
        if (message.id !== undefined) {
          reazonResultsRef.current.set(message.id, null);
          setReazonPendingCount((count) => Math.max(0, count - 1));
          flushReazonResults();
        } else {
          setReazonModelState('error');
          reazonInitializationHandlersRef.current?.reject(error);
          reazonInitializationHandlersRef.current = null;
          reazonInitializationRef.current = null;
          worker.terminate();
          if (reazonWorkerRef.current === worker) reazonWorkerRef.current = null;
        }
        setDiagnosticStatus({ tone: 'error', message: error.message });
        addDiagnosticLog('error', error.message);
      }
    });
    worker.addEventListener('error', () => {
      const error = new Error('ReazonSpeechワーカーを起動できませんでした。');
      setReazonModelState('error');
      setDiagnosticStatus({ tone: 'error', message: error.message });
      reazonInitializationHandlersRef.current?.reject(error);
      reazonInitializationHandlersRef.current = null;
      reazonInitializationRef.current = null;
      worker.terminate();
      if (reazonWorkerRef.current === worker) reazonWorkerRef.current = null;
    });

    const modelBaseUrl = new URL(`${process.env.PUBLIC_URL}/models/reazonspeech/`, window.location.origin).toString();
    worker.postMessage({ type: 'initialize', baseUrl: modelBaseUrl });
    return initialization;
  }, [addDiagnosticLog, flushReazonResults, reazonModelState]);

  const sendReazonChunk = useCallback((samples: Float32Array) => {
    if (samples.length < SAMPLE_RATE || !reazonWorkerRef.current) return;
    const id = reazonRequestIdRef.current;
    reazonRequestIdRef.current += 1;
    setReazonPendingCount((count) => count + 1);
    addDiagnosticLog('decode', `チャンク ${id + 1}（${(samples.length / SAMPLE_RATE).toFixed(1)}秒）`);
    reazonWorkerRef.current.postMessage({ type: 'transcribe', id, samples }, [samples.buffer]);
  }, [addDiagnosticLog]);

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
    if (microphoneStreamRef.current) return microphoneStreamRef.current;

    if (!navigator.mediaDevices?.getUserMedia) {
      setMeterError('このブラウザでは入力レベルを取得できません。');
      return null;
    }

    try {
      setMeterError('');
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const streamPromise = navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
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
      return stream;
    } catch {
      stopVolumeMeter();
      setMeterError('マイクの入力レベルを取得できませんでした。');
      return null;
    }
  }, [stopVolumeMeter]);

  const startReazonCapture = useCallback((stream: MediaStream) => {
    const audioContext = audioContextRef.current;
    if (!audioContext) throw new Error('音声処理を開始できませんでした。');
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    const silentGain = audioContext.createGain();
    silentGain.gain.value = 0;

    reazonChunksRef.current = [];
    reazonSampleCountRef.current = 0;
    processor.onaudioprocess = (event) => {
      const samples = downsampleAudio(event.inputBuffer.getChannelData(0), audioContext.sampleRate);
      reazonChunksRef.current.push(samples);
      reazonSampleCountRef.current += samples.length;

      if (reazonSampleCountRef.current >= WINDOW_SAMPLES) {
        sendReazonChunk(joinAudioChunks(reazonChunksRef.current));
        reazonChunksRef.current = keepLastSamples(reazonChunksRef.current, OVERLAP_SAMPLES);
        reazonSampleCountRef.current = reazonChunksRef.current[0]?.length || 0;
        setDetectedSpeech(true);
      }
    };

    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(audioContext.destination);
    reazonSourceRef.current = source;
    reazonProcessorRef.current = processor;
    reazonSilentGainRef.current = silentGain;
  }, [sendReazonChunk]);

  const stopReazonCapture = useCallback((flush = true) => {
    if (flush && reazonSampleCountRef.current >= SAMPLE_RATE) {
      sendReazonChunk(joinAudioChunks(reazonChunksRef.current));
    }
    reazonProcessorRef.current?.disconnect();
    reazonSourceRef.current?.disconnect();
    reazonSilentGainRef.current?.disconnect();
    reazonProcessorRef.current = null;
    reazonSourceRef.current = null;
    reazonSilentGainRef.current = null;
    reazonChunksRef.current = [];
    reazonSampleCountRef.current = 0;
    setReazonListening(false);
    stopVolumeMeter();
  }, [sendReazonChunk, stopVolumeMeter]);

  useEffect(() => {
    if (listening) {
      wasListeningRef.current = true;
    } else if (wasListeningRef.current && recognitionMode === 'web-speech') {
      wasListeningRef.current = false;
      stopVolumeMeter();
    }
  }, [listening, recognitionMode, stopVolumeMeter]);

  useEffect(() => () => {
    stopReazonCapture(false);
    reazonWorkerRef.current?.postMessage({ type: 'dispose' });
    reazonWorkerRef.current?.terminate();
  }, [stopReazonCapture]);

  useEffect(() => {
    const recognition = SpeechRecognition.getRecognition();
    if (!recognition || recognitionMode !== 'web-speech') return;

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
      recognitionCycleRef.current.heardSound = true;
      recognitionCycleRef.current.detectedSpeech = true;
      setHeardSound(true);
      setDetectedSpeech(true);
      setDiagnosticStatus({
        tone: 'listening',
        message: '発話として検出しました。認識結果を待っています。',
      });
      addDiagnosticLog('speechstart', '入力が発話として判定された');
    };

    const handleResult = () => {
      recognitionCycleRef.current.heardSound = true;
      recognitionCycleRef.current.detectedSpeech = true;
      recognitionCycleRef.current.receivedResult = true;
      setHeardSound(true);
      setDetectedSpeech(true);
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
  }, [addDiagnosticLog, recognitionMode]);

  const startClick = async () => {
    if (!selectedLanguage) return;

    setDiagnosticLog([]);
    setDiagnosticFinding(null);
    setDiagnosticStatus({
      tone: 'listening',
      message: '音声認識を起動しています。',
    });

    if (recognitionMode === 'web-speech') {
      const recognitionStart = SpeechRecognition.startListening({
        continuous: true,
        language: selectedLanguage,
      });
      void startVolumeMeter();
      await recognitionStart;
    } else {
      setDiagnosticStatus({ tone: 'listening', message: 'ローカルモデルを準備しています。' });
      try {
        const [stream] = await Promise.all([startVolumeMeter(), initializeReazonSpeech()]);
        if (!stream) return;

        reazonRequestIdRef.current = 0;
        nextReazonResultRef.current = 0;
        reazonResultsRef.current.clear();
        setReazonPendingCount(0);
        startReazonCapture(stream);
        setReazonListening(true);
        setHeardSound(true);
        setDiagnosticStatus({ tone: 'listening', message: '10秒ごとに端末内で音声を認識します。' });
        addDiagnosticLog('start', 'ローカルReazonSpeechを開始');
      } catch {
        stopVolumeMeter();
        return;
      }
    }

    if (isIOS) {
      setShowMicModeGuide(true);
    }
  };

  const stopClick = () => {
    if (recognitionMode === 'reazon-speech') {
      stopReazonCapture();
      addDiagnosticLog('stop', 'ローカルReazonSpeechを停止');
    } else {
      SpeechRecognition.stopListening();
      stopVolumeMeter();
    }
  };

  const clearTranscript = () => {
    if (recognitionMode === 'reazon-speech') {
      nextReazonResultRef.current = reazonRequestIdRef.current;
      reazonResultsRef.current.clear();
      setReazonTranscript('');
    }
    else resetTranscript();
  };

  const changeRecognitionMode = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setRecognitionMode(event.target.value as RecognitionMode);
    setSelectedLanguage('ja-JP');
    setDiagnosticStatus({ tone: 'idle', message: '開始すると音声認識の状態を診断します。' });
    setDiagnosticFinding(null);
  };

  const webSpeechUnavailable = recognitionMode === 'web-speech' && !browserSupportsSpeechRecognition;
  const microphoneUnavailable = recognitionMode === 'web-speech' && !isMicrophoneAvailable;
  const stepLabels = recognitionMode === 'reazon-speech'
    ? ['マイク入力', '固定長録音', '認識結果']
    : ['入力音通知', '発話判定', '認識結果'];

  return (
    <div className="speech-recognition">
      🎙️：{isActive ? '🔈' : '🔇'}
      <button aria-label="音声認識を開始" onClick={startClick} disabled={isActive || webSpeechUnavailable || microphoneUnavailable}>▶️</button>
      <button aria-label="音声認識を停止" onClick={stopClick} disabled={!isActive}>■</button>
      <button aria-label="認識結果を消去" onClick={clearTranscript}>🗑️</button>
      <select aria-label="認識言語" value={selectedLanguage} onChange={handleChange} disabled={isActive || recognitionMode === 'reazon-speech'}>
        <option value="">select language.</option>
        <option value="en-US">en</option>
        <option value="ja-JP">ja</option>
      </select>
      <label className="recognition-mode">
        認識方式
        <select aria-label="認識方式" value={recognitionMode} onChange={changeRecognitionMode} disabled={isActive}>
          <option value="web-speech">Web Speech（従来）</option>
          <option value="reazon-speech">ReazonSpeech（ローカル）</option>
        </select>
      </label>
      {recognitionMode === 'reazon-speech' && (
        <section className="model-status" aria-label="ローカルモデルの状態">
          <div><span>日本語モデル</span><output>{reazonModelState === 'ready' ? '準備完了' : reazonModelState === 'loading' ? `${Math.round(reazonProgress)}%` : reazonModelState === 'error' ? '読込失敗' : '初回約180MB'}</output></div>
          <progress max={100} value={reazonProgress} />
          <p>初回だけモデルを取得します。認識時の音声は端末外へ送信しません。</p>
        </section>
      )}
      {webSpeechUnavailable && <p className="volume-meter-error">このブラウザはWeb Speech APIに対応していません。</p>}
      {microphoneUnavailable && <p className="volume-meter-error">マイクの使用を許可してください。</p>}
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
          {recognitionMode === 'reazon-speech' && reazonPendingCount > 0 && (
            <span className="diagnostic-pending">認識待ち: {reazonPendingCount}件</span>
          )}
        </div>
        <div className="diagnostic-steps" aria-label="認識処理の進行状況">
          <span className={heardSound ? 'is-detected' : ''}>
            <b>1</b> {stepLabels[0]}
          </span>
          <span aria-hidden="true">→</span>
          <span className={detectedSpeech ? 'is-detected' : ''}>
            <b>2</b> {stepLabels[1]}
          </span>
          <span aria-hidden="true">→</span>
          <span className={receivedResult ? 'is-detected' : ''}>
            <b>3</b> 認識結果
          </span>
        </div>
        {recognitionMode === 'web-speech' && (
          <p className="diagnostic-note">iOSでは入力音通知が省略されることがあります。発話判定または認識結果が届けば入力されています。</p>
        )}
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
      <div ref={displayRef}>
        <AutoScrollingText text={displayedTranscript} />
      </div>
    </div>
  );
};
export default SpeechRecognitionComponent;
