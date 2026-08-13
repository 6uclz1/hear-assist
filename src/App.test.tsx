import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import App from './App';

const mockRecognition = new EventTarget();

vi.mock('./createReazonWorker', () => ({
  createReazonWorker: vi.fn(),
}));

vi.mock('react-speech-recognition', () => ({
  __esModule: true,
  default: {
    startListening: vi.fn(),
    stopListening: vi.fn(),
    getRecognition: () => mockRecognition,
  },
  useSpeechRecognition: () => ({
    transcript: '',
    interimTranscript: '',
    listening: false,
    resetTranscript: vi.fn(),
    browserSupportsSpeechRecognition: true,
    isMicrophoneAvailable: true,
  }),
}));

test('renders speech recognition controls with Japanese selected', async () => {
  Object.defineProperty(window.navigator, 'userAgent', {
    value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)',
    configurable: true,
  });

  render(<App />);
  expect(screen.getByRole('button', { name: '認識を開始' })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: '言語' })).toHaveValue('ja-JP');
  expect(screen.getByRole('combobox', { name: '認識方式' })).toHaveValue('web-speech');
  expect(screen.getByRole('meter', { name: 'マイク入力レベル' })).toHaveAttribute(
    'aria-valuetext',
    '計測停止中',
  );

  fireEvent.click(screen.getByRole('button', { name: '認識を開始' }));
  expect(await screen.findByRole('dialog')).toHaveTextContent('ワイドスペクトル');
});

test('keeps local ReazonSpeech available alongside Web Speech', () => {
  render(<App />);
  fireEvent.change(screen.getByRole('combobox', { name: '認識方式' }), {
    target: { value: 'reazon-speech' },
  });

  expect(screen.getByRole('combobox', { name: '認識方式' })).toHaveValue('reazon-speech');
  expect(screen.getByRole('combobox', { name: '字幕の更新速度' })).toHaveValue('standard');
  expect(screen.getByRole('combobox', { name: '字幕の更新速度' })).toHaveTextContent('高速（4秒）');
  expect(screen.getByRole('combobox', { name: '字幕の更新速度' })).toHaveTextContent('高精度（10秒）');
  expect(screen.getByText('6秒の音声を約4秒間隔で処理します。')).toBeInTheDocument();
  expect(screen.getByLabelText('ローカルモデルの状態')).toHaveTextContent('初回約180MB');
  expect(screen.getByRole('combobox', { name: '言語' })).toBeDisabled();
});

test('changes the local recognition span', () => {
  render(<App />);
  fireEvent.change(screen.getByRole('combobox', { name: '認識方式' }), {
    target: { value: 'reazon-speech' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: '字幕の更新速度' }), {
    target: { value: 'fast' },
  });

  expect(screen.getByRole('combobox', { name: '字幕の更新速度' })).toHaveValue('fast');
  expect(screen.getByText('4秒の音声を約3秒間隔で処理します。')).toBeInTheDocument();
});

test('diagnoses sound that is not classified as speech', () => {
  render(<App />);

  act(() => {
    mockRecognition.dispatchEvent(new Event('start'));
    mockRecognition.dispatchEvent(new Event('soundstart'));
  });

  expect(screen.getByText('音声入力を検出しました。発話判定を待っています。')).toBeInTheDocument();
  const progress = within(screen.getByLabelText('認識処理の進行状況'));
  expect(progress.getByText(/入力音/)).toHaveClass('is-complete');
  expect(progress.getByText(/発話判定/)).not.toHaveClass('is-complete');

  act(() => {
    mockRecognition.dispatchEvent(new Event('end'));
  });

  expect(screen.getAllByText('音は届いていますが、発話として判定されませんでした。')).toHaveLength(2);
});

test('diagnoses speech that does not produce a recognition result', () => {
  render(<App />);

  act(() => {
    mockRecognition.dispatchEvent(new Event('start'));
    mockRecognition.dispatchEvent(new Event('soundstart'));
    mockRecognition.dispatchEvent(new Event('speechstart'));
    mockRecognition.dispatchEvent(new Event('end'));
  });

  expect(screen.getAllByText('発話は検出されましたが、認識結果が返りませんでした。')).toHaveLength(2);
  const progress = within(screen.getByLabelText('認識処理の進行状況'));
  expect(progress.getByText(/発話判定/)).toHaveClass('is-complete');
  expect(progress.getByText(/認識結果/)).not.toHaveClass('is-complete');
});

test('records nomatch and recognition errors in the event log', () => {
  render(<App />);

  act(() => {
    mockRecognition.dispatchEvent(new Event('start'));
    mockRecognition.dispatchEvent(new Event('nomatch'));
  });

  expect(screen.getAllByText('入力を文字として認識できませんでした。')).toHaveLength(2);

  const errorEvent = new Event('error');
  Object.defineProperty(errorEvent, 'error', { value: 'no-speech' });
  act(() => {
    mockRecognition.dispatchEvent(errorEvent);
  });

  expect(screen.getByText('音声認識エラー: no-speech')).toBeInTheDocument();
  expect(screen.getByText('nomatch')).toBeInTheDocument();
  expect(screen.getByText('error')).toBeInTheDocument();
});

test('keeps the latest diagnosis visible across automatic recognition restarts', () => {
  render(<App />);

  act(() => {
    mockRecognition.dispatchEvent(new Event('start'));
    mockRecognition.dispatchEvent(new Event('soundstart'));
    mockRecognition.dispatchEvent(new Event('end'));
    mockRecognition.dispatchEvent(new Event('start'));
  });

  expect(screen.getByText(/直近の判定/).closest('p')).toHaveTextContent(
    '音は届いていますが、発話として判定されませんでした。',
  );
});
