import { Activity, useCallback, useEffect, useRef, useState } from 'react';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import './SpeechRecognitionComponent.css'
import AutoScrollingText from './AutoScrollingText';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import { InputMeter } from './components/InputMeter';
import { MicModeDialog } from './components/MicModeDialog';
import { RecognitionControls } from './components/RecognitionControls';
import { createReazonWorker } from './createReazonWorker';
import { downsampleAudio, joinAudioChunks, keepLastSamples, mergeTranscriptChunk, SAMPLE_RATE } from './reazonSpeech';

export type RecognitionMode = 'web-speech' | 'reazon-speech';
export type RecognitionSpan = 'fast' | 'standard' | 'accurate';
type DiagnosticTone = 'idle' | 'listening' | 'success' | 'warning' | 'error';

export type DiagnosticStatus = {
  tone: DiagnosticTone;
  message: string;
};

export type DiagnosticLogEntry = {
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

export type RecognitionSpanConfig = {
  label: string;
  windowSeconds: number;
  overlapSeconds: number;
};

export const RECOGNITION_SPANS: Record<RecognitionSpan, RecognitionSpanConfig> = {
  fast: { label: '高速（4秒）', windowSeconds: 4, overlapSeconds: 1 },
  standard: { label: '標準（6秒）', windowSeconds: 6, overlapSeconds: 2 },
  accurate: { label: '高精度（10秒）', windowSeconds: 10, overlapSeconds: 2 },
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
    interimTranscript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable
  } = useSpeechRecognition();
  
  const [recognitionMode, setRecognitionMode] = useState<RecognitionMode>('web-speech');
  const [recognitionSpan, setRecognitionSpan] = useState<RecognitionSpan>('standard');
  const [reazonTranscript, setReazonTranscript] = useState('');
  const [reazonHighlightedTranscript, setReazonHighlightedTranscript] = useState('');
  const [webHighlightedTranscript, setWebHighlightedTranscript] = useState('');
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
  const reazonTranscriptRef = useRef('');
  const previousWebTranscriptRef = useRef('');
  const isIOS = isIOSDevice();
  const isActive = recognitionMode === 'reazon-speech' ? reazonListening : listening;
  const displayedTranscript = recognitionMode === 'reazon-speech' ? reazonTranscript : transcript;
  const displayedHighlight = recognitionMode === 'reazon-speech'
    ? reazonHighlightedTranscript
    : (interimTranscript?.trim() || webHighlightedTranscript);
  const recognitionSpanConfig = RECOGNITION_SPANS[recognitionSpan];

  useEffect(() => {
    if (recognitionMode !== 'web-speech') return;
    const previous = previousWebTranscriptRef.current;
    if (!transcript) {
      previousWebTranscriptRef.current = '';
      // This mirrors an external recognition source, so resetting its derived
      // highlight in the subscription effect is intentional.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWebHighlightedTranscript('');
      return;
    }

    let commonLength = 0;
    while (
      commonLength < previous.length
      && commonLength < transcript.length
      && previous[commonLength] === transcript[commonLength]
    ) commonLength += 1;

    const addition = transcript.slice(commonLength).trim();
    if (addition) setWebHighlightedTranscript(addition);
    previousWebTranscriptRef.current = transcript;
  }, [recognitionMode, transcript]);

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
      if (text) {
        const merged = mergeTranscriptChunk(reazonTranscriptRef.current, text);
        reazonTranscriptRef.current = merged.transcript;
        setReazonTranscript(merged.transcript);
        if (merged.addition) setReazonHighlightedTranscript(merged.addition);
      }
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

    const modelBaseUrl = new URL(
      `${import.meta.env.BASE_URL}models/reazonspeech/`,
      window.location.origin,
    ).toString();
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
    const windowSamples = SAMPLE_RATE * recognitionSpanConfig.windowSeconds;
    const overlapSamples = SAMPLE_RATE * recognitionSpanConfig.overlapSeconds;
    processor.onaudioprocess = (event) => {
      const samples = downsampleAudio(event.inputBuffer.getChannelData(0), audioContext.sampleRate);
      reazonChunksRef.current.push(samples);
      reazonSampleCountRef.current += samples.length;

      if (reazonSampleCountRef.current >= windowSamples) {
        sendReazonChunk(joinAudioChunks(reazonChunksRef.current));
        reazonChunksRef.current = keepLastSamples(reazonChunksRef.current, overlapSamples);
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
  }, [recognitionSpanConfig, sendReazonChunk]);

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
        const updateSeconds = recognitionSpanConfig.windowSeconds - recognitionSpanConfig.overlapSeconds;
        setDiagnosticStatus({
          tone: 'listening',
          message: `${recognitionSpanConfig.windowSeconds}秒録音・約${updateSeconds}秒間隔で端末内認識します。`,
        });
        addDiagnosticLog('start', `ローカルReazonSpeechを${recognitionSpanConfig.label}で開始`);
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
      reazonTranscriptRef.current = '';
      setReazonTranscript('');
      setReazonHighlightedTranscript('');
    }
    else {
      previousWebTranscriptRef.current = '';
      setWebHighlightedTranscript('');
      resetTranscript();
    }
  };

  const changeRecognitionMode = (mode: RecognitionMode) => {
    setRecognitionMode(mode);
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
    <main id="main-content" className="app-shell">
      <header className="app-header"><div className="brand-mark" aria-hidden="true">H</div><div><p className="eyebrow">Live captions</p><h1>Hear Assist</h1><p>周囲の会話を、読みやすいリアルタイム字幕に。</p></div></header>
      <div className="workspace">
        <div className="settings-column">
          <RecognitionControls active={isActive} mode={recognitionMode} onModeChange={changeRecognitionMode} language={selectedLanguage} onLanguageChange={setSelectedLanguage} span={recognitionSpan} spans={RECOGNITION_SPANS} onSpanChange={setRecognitionSpan} modelState={reazonModelState} modelProgress={reazonProgress} startDisabled={webSpeechUnavailable || microphoneUnavailable} onStart={startClick} onStop={stopClick} onClear={clearTranscript} />
          {webSpeechUnavailable && <p className="inline-alert" role="alert">このブラウザはWeb Speech APIに対応していません。</p>}
          {microphoneUnavailable && <p className="inline-alert" role="alert">マイクの使用を許可してください。</p>}
          <InputMeter level={volumeLevel} db={volumeDb} error={meterError} />
          <DiagnosticsPanel mode={recognitionMode} status={diagnosticStatus} finding={diagnosticFinding} pendingCount={reazonPendingCount} steps={[heardSound, detectedSpeech, receivedResult]} labels={stepLabels} logs={diagnosticLog} />
          {isIOS && <button className="button button-link" onClick={() => setShowMicModeGuide(true)}>iPhoneのマイク設定を確認</button>}
        </div>
        <div className="subtitle-column"><AutoScrollingText text={displayedTranscript} highlightedText={displayedHighlight} listening={isActive} /></div>
      </div>
      <Activity mode={showMicModeGuide ? 'visible' : 'hidden'}><MicModeDialog onClose={() => setShowMicModeGuide(false)} /></Activity>
    </main>
  );
};
export default SpeechRecognitionComponent;
