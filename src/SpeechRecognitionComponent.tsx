import { Activity, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import './SpeechRecognitionComponent.css'
import AutoScrollingText, { type CaptionStatus } from './AutoScrollingText';
import { MicModeDialog } from './components/MicModeDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { createReazonWorker } from './createReazonWorker';
import { useStoredState } from './hooks/useStoredState';
import { downsampleAudio, joinAudioChunks, keepLastSamples, mergeTranscriptChunk, SAMPLE_RATE } from './reazonSpeech';

export type RecognitionMode = 'web-speech' | 'reazon-speech';
export type RecognitionSpan = 'fast' | 'standard' | 'accurate';
export type SubtitleContrast = 'dark' | 'light' | 'yellow';
export type SubtitleFocus = 'one' | 'two' | 'history';
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
  type: 'progress' | 'ready' | 'result' | 'dropped' | 'error';
  loaded?: number;
  total?: number;
  session?: number;
  id?: number;
  text?: string;
  message?: string;
};

type QueuedReazonChunk = { id: number; session: number; samples: Float32Array; queuedAt: number };

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
  
  const [recognitionMode, setRecognitionMode] = useStoredState<RecognitionMode>('hear-assist:recognition-mode', 'reazon-speech');
  const [recognitionSpan, setRecognitionSpan] = useStoredState<RecognitionSpan>('hear-assist:recognition-span', 'standard');
  const [subtitleContrast, setSubtitleContrast] = useStoredState<SubtitleContrast>('hear-assist:contrast', 'dark');
  const [subtitleFocus, setSubtitleFocus] = useStoredState<SubtitleFocus>('hear-assist:focus', 'two');
  const [subtitleLineHeight, setSubtitleLineHeight] = useStoredState('hear-assist:line-height', 1.5);
  const [reazonTranscript, setReazonTranscript] = useState('');
  const [reazonHighlightedTranscript, setReazonHighlightedTranscript] = useState('');
  const [webHighlightedTranscript, setWebHighlightedTranscript] = useState('');
  const [reazonListening, setReazonListening] = useState(false);
  const [reazonModelState, setReazonModelState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [reazonProgress, setReazonProgress] = useState(0);
  const [reazonPendingCount, setReazonPendingCount] = useState(0);
  const [selectedLanguage, setSelectedLanguage] = useStoredState('hear-assist:language', 'ja-JP');
  const [showMicModeGuide, setShowMicModeGuide] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [starting, setStarting] = useState(false);
  const [interruptionMessage, setInterruptionMessage] = useState('');
  const [lastProcessedAt, setLastProcessedAt] = useState<number | null>(null);
  const [recognitionStartedAt, setRecognitionStartedAt] = useState<number | null>(null);
  const [oldestPendingAt, setOldestPendingAt] = useState<number | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const [droppedChunkCount, setDroppedChunkCount] = useState(0);
  const [lastDroppedAt, setLastDroppedAt] = useState<number | null>(null);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [volumeRms, setVolumeRms] = useState<number | null>(null);
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
  const reazonSessionRef = useRef(0);
  const reazonChunkQueueRef = useRef<QueuedReazonChunk[]>([]);
  const reazonProcessingRef = useRef<QueuedReazonChunk | null>(null);
  const reazonRequestTimesRef = useRef(new Map<number, number>());
  const nextReazonResultRef = useRef(0);
  const reazonResultsRef = useRef(new Map<number, string | null>());
  const reazonTranscriptRef = useRef('');
  const previousWebTranscriptRef = useRef('');
  const intendedListeningRef = useRef(false);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const isIOS = isIOSDevice();
  const isActive = recognitionMode === 'reazon-speech' ? reazonListening : listening;
  const displayedTranscript = recognitionMode === 'reazon-speech' ? reazonTranscript : transcript;
  const displayedHighlight = recognitionMode === 'reazon-speech'
    ? reazonHighlightedTranscript
    : (interimTranscript?.trim() || webHighlightedTranscript);
  const recognitionSpanConfig = RECOGNITION_SPANS[recognitionSpan];

  useEffect(() => {
    if (!isActive && !starting) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isActive, starting]);

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
    if (addition) {
      setWebHighlightedTranscript(addition);
      setLastProcessedAt(Date.now());
    }
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

  const pumpReazonQueue = useCallback(() => {
    if (reazonProcessingRef.current || !reazonWorkerRef.current) return;
    const next = reazonChunkQueueRef.current.shift();
    if (!next) {
      setReazonPendingCount(0);
      setOldestPendingAt(null);
      return;
    }
    reazonProcessingRef.current = next;
    setOldestPendingAt(next.queuedAt);
    setReazonPendingCount(reazonChunkQueueRef.current.length + 1);
    reazonWorkerRef.current.postMessage(
      { type: 'transcribe', session: next.session, id: next.id, samples: next.samples },
      [next.samples.buffer],
    );
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
      } else if ((message.type === 'result' || message.type === 'dropped') && message.id !== undefined) {
        if (message.session !== undefined && message.session !== reazonSessionRef.current) return;
        const elapsed = Date.now() - (reazonRequestTimesRef.current.get(message.id) || Date.now());
        reazonRequestTimesRef.current.delete(message.id);
        if (reazonProcessingRef.current?.id === message.id) reazonProcessingRef.current = null;
        setOldestPendingAt(reazonChunkQueueRef.current[0]?.queuedAt || null);
        setReazonPendingCount(reazonChunkQueueRef.current.length);
        if (message.id < nextReazonResultRef.current) {
          queueMicrotask(pumpReazonQueue);
          return;
        }
        reazonResultsRef.current.set(message.id, message.type === 'result' ? message.text?.trim() || null : null);
        setLastProcessedAt(Date.now());
        if (message.type === 'result' && message.text) {
          setReceivedResult(true);
          setDiagnosticStatus({ tone: 'success', message: 'ReazonSpeechの認識結果を受信しました。' });
        }
        if (message.type === 'dropped') {
          setDroppedChunkCount((count) => count + 1);
          setLastDroppedAt(Date.now());
        }
        addDiagnosticLog(message.type, message.type === 'dropped' ? `古いチャンク ${message.id + 1} を破棄` : message.text ? `チャンク ${message.id + 1} の認識結果（${(elapsed / 1000).toFixed(1)}秒）` : '認識結果なし');
        flushReazonResults();
        queueMicrotask(pumpReazonQueue);
      } else if (message.type === 'error') {
        const error = new Error(message.message || 'ReazonSpeechの初期化に失敗しました。');
        if (message.id !== undefined) {
          if (message.session !== undefined && message.session !== reazonSessionRef.current) return;
          reazonResultsRef.current.set(message.id, null);
          reazonRequestTimesRef.current.delete(message.id);
          if (reazonProcessingRef.current?.id === message.id) reazonProcessingRef.current = null;
          setOldestPendingAt(reazonChunkQueueRef.current[0]?.queuedAt || null);
          setReazonPendingCount(reazonChunkQueueRef.current.length);
          flushReazonResults();
          queueMicrotask(pumpReazonQueue);
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
  }, [addDiagnosticLog, flushReazonResults, pumpReazonQueue, reazonModelState]);

  const sendReazonChunk = useCallback((samples: Float32Array) => {
    if (samples.length < SAMPLE_RATE || !reazonWorkerRef.current) return;
    const id = reazonRequestIdRef.current;
    reazonRequestIdRef.current += 1;
    const chunk: QueuedReazonChunk = { id, session: reazonSessionRef.current, samples, queuedAt: Date.now() };
    if (reazonChunkQueueRef.current.length >= 2) {
      const dropped = reazonChunkQueueRef.current.shift();
      if (dropped) {
        reazonResultsRef.current.set(dropped.id, null);
        reazonRequestTimesRef.current.delete(dropped.id);
        setDroppedChunkCount((count) => count + 1);
        setLastDroppedAt(Date.now());
        addDiagnosticLog('dropped', `遅延防止のためチャンク ${dropped.id + 1} を破棄`);
        flushReazonResults();
      }
    }
    reazonChunkQueueRef.current.push(chunk);
    setOldestPendingAt(reazonProcessingRef.current?.queuedAt || reazonChunkQueueRef.current[0]?.queuedAt || null);
    reazonRequestTimesRef.current.set(id, chunk.queuedAt);
    setReazonPendingCount(reazonChunkQueueRef.current.length + (reazonProcessingRef.current ? 1 : 0));
    addDiagnosticLog('decode', `チャンク ${id + 1}（${(samples.length / SAMPLE_RATE).toFixed(1)}秒）`);
    pumpReazonQueue();
  }, [addDiagnosticLog, flushReazonResults, pumpReazonQueue]);

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
    setVolumeRms(null);
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
      stream.getAudioTracks().forEach((track) => {
        track.addEventListener('mute', () => {
          if (intendedListeningRef.current) setInterruptionMessage('マイクが一時停止しました。通話や画面ロックの終了後に自動で再開します。');
        });
        track.addEventListener('unmute', () => {
          if (intendedListeningRef.current) {
            void audioContextRef.current?.resume();
            setInterruptionMessage('');
          }
        });
        track.addEventListener('ended', () => {
          if (intendedListeningRef.current) setInterruptionMessage('マイク接続が中断されました。画面に戻ると再接続します。');
        });
      });

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

          setVolumeRms(rms);
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

  const requestWakeLock = useCallback(async () => {
    const wakeLockApi = (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    if (!wakeLockApi || document.visibilityState !== 'visible' || wakeLockRef.current) return;
    try { wakeLockRef.current = await wakeLockApi.request('screen'); } catch { /* The status bar still makes suspension visible. */ }
  }, []);

  useEffect(() => {
    if (isActive) void requestWakeLock();
    else if (wakeLockRef.current) {
      void wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  }, [isActive, requestWakeLock]);

  const recoverAfterInterruption = useCallback(async () => {
    if (!intendedListeningRef.current || document.visibilityState !== 'visible') return;
    setInterruptionMessage('音声認識を再開しています。');
    try {
      if (recognitionMode === 'reazon-speech') {
        const streamIsLive = microphoneStreamRef.current?.getAudioTracks().some((track) => track.readyState === 'live');
        if (streamIsLive && audioContextRef.current) {
          await audioContextRef.current.resume();
          setReazonListening(true);
        } else {
          stopReazonCapture(false);
          const stream = await startVolumeMeter();
          if (!stream || !intendedListeningRef.current) throw new Error('マイクを再接続できませんでした。');
          startReazonCapture(stream);
          setReazonListening(true);
        }
      } else if (!listening) {
        await SpeechRecognition.startListening({ continuous: true, language: selectedLanguage });
        void startVolumeMeter();
      }
      setInterruptionMessage('');
      void requestWakeLock();
      addDiagnosticLog('resume', '画面復帰後に音声認識を再開');
    } catch {
      setInterruptionMessage('自動再開できませんでした。停止してから、もう一度開始してください。');
    }
  }, [addDiagnosticLog, listening, recognitionMode, requestWakeLock, selectedLanguage, startReazonCapture, startVolumeMeter, stopReazonCapture]);

  useEffect(() => {
    const handleVisibility = () => {
      if (!intendedListeningRef.current) return;
      if (document.visibilityState === 'hidden') {
        setInterruptionMessage('画面ロックまたは他のアプリにより、マイクが一時停止することがあります。');
        wakeLockRef.current = null;
      } else {
        void recoverAfterInterruption();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pageshow', recoverAfterInterruption);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pageshow', recoverAfterInterruption);
    };
  }, [recoverAfterInterruption]);

  useEffect(() => {
    if (listening) {
      wasListeningRef.current = true;
    } else if (wasListeningRef.current && recognitionMode === 'web-speech') {
      wasListeningRef.current = false;
      stopVolumeMeter();
    }
  }, [listening, recognitionMode, stopVolumeMeter]);

  useEffect(() => {
    if (recognitionMode !== 'web-speech' || listening || starting || !intendedListeningRef.current || diagnosticStatus.tone === 'error' || document.visibilityState !== 'visible') return;
    const timer = window.setTimeout(() => {
      if (!intendedListeningRef.current) return;
      void SpeechRecognition.startListening({ continuous: true, language: selectedLanguage });
      void startVolumeMeter();
      addDiagnosticLog('restart', '停止したWeb Speechを自動再開');
    }, 800);
    return () => window.clearTimeout(timer);
  }, [addDiagnosticLog, diagnosticStatus.tone, listening, recognitionMode, selectedLanguage, startVolumeMeter, starting]);

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
      setLastProcessedAt(Date.now());
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
    if (!selectedLanguage || starting || isActive) return;

    intendedListeningRef.current = true;
    setStarting(true);
    setInterruptionMessage('');
    setDroppedChunkCount(0);
    setLastDroppedAt(null);
    setDiagnosticLog([]);
    setDiagnosticFinding(null);
    setDiagnosticStatus({
      tone: 'listening',
      message: '音声認識を起動しています。',
    });

    try {
      if (recognitionMode === 'web-speech') {
        const recognitionStart = SpeechRecognition.startListening({ continuous: true, language: selectedLanguage });
        void startVolumeMeter();
        await recognitionStart;
        setRecognitionStartedAt(Date.now());
      } else {
        setDiagnosticStatus({ tone: 'listening', message: 'ローカルモデルを準備しています。' });
        const [stream] = await Promise.all([startVolumeMeter(), initializeReazonSpeech()]);
        if (!stream) throw new Error('マイクを開始できませんでした。');

        reazonSessionRef.current += 1;
        reazonWorkerRef.current?.postMessage({ type: 'reset', session: reazonSessionRef.current });
        nextReazonResultRef.current = reazonRequestIdRef.current;
        reazonResultsRef.current.clear();
        reazonChunkQueueRef.current = [];
        reazonProcessingRef.current = null;
        reazonRequestTimesRef.current.clear();
        setOldestPendingAt(null);
        setReazonPendingCount(0);
        startReazonCapture(stream);
        setReazonListening(true);
        setRecognitionStartedAt(Date.now());
        setHeardSound(true);
        const updateSeconds = recognitionSpanConfig.windowSeconds - recognitionSpanConfig.overlapSeconds;
        setDiagnosticStatus({
          tone: 'listening',
          message: `${recognitionSpanConfig.windowSeconds}秒録音・約${updateSeconds}秒間隔で端末内認識します。`,
        });
        addDiagnosticLog('start', `ローカルReazonSpeechを${recognitionSpanConfig.label}で開始`);
      }
      if (isIOS && window.localStorage.getItem('hear-assist:mic-guide-seen') !== 'true') {
        setShowMicModeGuide(true);
        window.localStorage.setItem('hear-assist:mic-guide-seen', 'true');
      }
    } catch (error) {
      intendedListeningRef.current = false;
      stopVolumeMeter();
      setDiagnosticStatus({ tone: 'error', message: error instanceof Error ? error.message : '音声認識を開始できませんでした。' });
    } finally {
      setStarting(false);
    }
  };

  const stopClick = () => {
    intendedListeningRef.current = false;
    setStarting(false);
    setInterruptionMessage('');
    setRecognitionStartedAt(null);
    if (recognitionMode === 'reazon-speech') {
      reazonSessionRef.current += 1;
      reazonWorkerRef.current?.postMessage({ type: 'reset', session: reazonSessionRef.current });
      reazonChunkQueueRef.current = [];
      reazonProcessingRef.current = null;
      reazonRequestTimesRef.current.clear();
      setOldestPendingAt(null);
      setReazonPendingCount(0);
      stopReazonCapture(false);
      addDiagnosticLog('stop', 'ローカルReazonSpeechを停止');
    } else {
      SpeechRecognition.stopListening();
      stopVolumeMeter();
    }
  };

  const clearTranscript = () => {
    if (recognitionMode === 'reazon-speech') {
      reazonSessionRef.current += 1;
      reazonWorkerRef.current?.postMessage({ type: 'reset', session: reazonSessionRef.current });
      reazonChunkQueueRef.current = [];
      reazonProcessingRef.current = null;
      reazonRequestTimesRef.current.clear();
      setOldestPendingAt(null);
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
    setLastProcessedAt(null);
    setRecognitionStartedAt(isActive ? Date.now() : null);
  };

  const changeRecognitionMode = (mode: RecognitionMode) => {
    setRecognitionMode(mode);
    setSelectedLanguage('ja-JP');
    setDiagnosticStatus({ tone: 'idle', message: '開始すると音声認識の状態を診断します。' });
    setDiagnosticFinding(null);
    setLastProcessedAt(null);
    setRecognitionStartedAt(null);
  };
  const openSettings = useCallback(() => setShowSettings(true), []);
  const closeSettings = useCallback(() => setShowSettings(false), []);
  const openMicGuide = useCallback(() => { setShowSettings(false); setShowMicModeGuide(true); }, []);

  const webSpeechUnavailable = recognitionMode === 'web-speech' && !browserSupportsSpeechRecognition;
  const microphoneUnavailable = recognitionMode === 'web-speech' && !isMicrophoneAvailable;
  const stepLabels = recognitionMode === 'reazon-speech'
    ? ['マイク入力', '固定長録音', '認識結果']
    : ['入力音通知', '発話判定', '認識結果'];

  const updateMilliseconds = (recognitionSpanConfig.windowSeconds - recognitionSpanConfig.overlapSeconds) * 1000;
  const recognitionIsDelayed = recognitionMode === 'reazon-speech' && isActive && (
    (oldestPendingAt !== null && clock - oldestPendingAt > updateMilliseconds * 2.5)
    || (lastProcessedAt !== null && clock - lastProcessedAt > updateMilliseconds * 3)
    || (lastProcessedAt === null && recognitionStartedAt !== null && clock - recognitionStartedAt > recognitionSpanConfig.windowSeconds * 2_500)
    || (lastDroppedAt !== null && clock - lastDroppedAt < 12_000)
  );
  const lastRecognitionLabel = lastProcessedAt === null ? 'まだありません'
    : clock - lastProcessedAt < 2_000 ? 'たった今'
      : `${Math.floor((clock - lastProcessedAt) / 1000)}秒前`;
  const captionStatus = useMemo<CaptionStatus>(() => {
    if (interruptionMessage) return { tone: 'interrupted', label: '一時停止しています', detail: interruptionMessage };
    if (starting) return { tone: 'starting', label: '準備しています', detail: recognitionMode === 'reazon-speech' && reazonModelState === 'loading' ? `オフラインモデル ${Math.round(reazonProgress)}%` : 'マイクを起動しています' };
    if (recognitionIsDelayed) return { tone: 'delayed', label: '認識が遅れています', detail: droppedChunkCount > 0 ? `最新の会話を優先するため、古い音声を${droppedChunkCount}件省略しました` : '最新の会話へ追いついています' };
    if (webSpeechUnavailable) return { tone: 'error', label: '利用できません', detail: 'このブラウザはWeb Speechに対応していません。設定から端末内認識を選んでください' };
    if (microphoneUnavailable) return { tone: 'error', label: 'マイクを使用できません', detail: 'ブラウザの設定でマイクを許可してください' };
    if (recognitionMode === 'reazon-speech' && reazonModelState === 'error') return { tone: 'error', label: 'モデルを準備できません', detail: diagnosticStatus.message };
    if (diagnosticStatus.tone === 'error') return { tone: 'error', label: '認識エラー', detail: diagnosticStatus.message };
    if (isActive) return { tone: 'live', label: '認識中', detail: recognitionMode === 'reazon-speech' ? '端末内で音声を処理しています' : 'Web Speechで音声を処理しています' };
    return { tone: 'stopped', label: '停止中', detail: '「字幕を開始」を押してください' };
  }, [diagnosticStatus, droppedChunkCount, interruptionMessage, isActive, microphoneUnavailable, recognitionIsDelayed, recognitionMode, reazonModelState, reazonProgress, starting, webSpeechUnavailable]);
  const startDisabled = starting || webSpeechUnavailable || microphoneUnavailable;

  return (
    <main id="main-content" className="app-shell">
      <h1 className="visually-hidden">Hear Assist</h1>
      <AutoScrollingText text={displayedTranscript} highlightedText={displayedHighlight} active={isActive} status={captionStatus} lastRecognitionLabel={lastRecognitionLabel} inputLevel={{ rms: volumeRms, db: volumeDb, level: volumeLevel }} contrast={subtitleContrast} focus={subtitleFocus} lineHeight={subtitleLineHeight} startDisabled={startDisabled} onStart={startClick} onStop={stopClick} onClear={clearTranscript} onOpenSettings={openSettings} />
      {showSettings && <SettingsDialog active={isActive || starting} mode={recognitionMode} onModeChange={changeRecognitionMode} language={selectedLanguage} onLanguageChange={setSelectedLanguage} span={recognitionSpan} spans={RECOGNITION_SPANS} onSpanChange={setRecognitionSpan} contrast={subtitleContrast} onContrastChange={setSubtitleContrast} focus={subtitleFocus} onFocusChange={setSubtitleFocus} lineHeight={subtitleLineHeight} onLineHeightChange={setSubtitleLineHeight} modelState={reazonModelState} modelProgress={reazonProgress} meter={{ level: volumeLevel, rms: volumeRms, db: volumeDb, error: meterError }} diagnostics={{ status: diagnosticStatus, finding: diagnosticFinding, pendingCount: reazonPendingCount, steps: [heardSound, detectedSpeech, receivedResult], labels: stepLabels, logs: diagnosticLog }} onClose={closeSettings} onOpenMicGuide={isIOS ? openMicGuide : undefined} />}
      <Activity mode={showMicModeGuide ? 'visible' : 'hidden'}><MicModeDialog onClose={() => setShowMicModeGuide(false)} /></Activity>
    </main>
  );
};
export default SpeechRecognitionComponent;
