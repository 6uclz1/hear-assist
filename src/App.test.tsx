import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import App from './App';

const mockRecognition = new EventTarget();

vi.mock('./createReazonWorker', () => ({ createReazonWorker: vi.fn() }));
vi.mock('react-speech-recognition', () => ({
  __esModule: true,
  default: {
    startListening: vi.fn(),
    stopListening: vi.fn(),
    getRecognition: () => mockRecognition,
  },
  useSpeechRecognition: () => ({
    transcript: '', interimTranscript: '', listening: false, resetTranscript: vi.fn(),
    browserSupportsSpeechRecognition: true, isMicrophoneAvailable: true,
  }),
}));

beforeEach(() => window.localStorage.clear());

const openSettings = () => {
  fireEvent.click(screen.getByRole('button', { name: '設定' }));
  return screen.getByRole('dialog', { name: '設定' });
};

const selectWebSpeech = () => {
  const dialog = openSettings();
  fireEvent.change(within(dialog).getByRole('combobox', { name: '認識方式' }), { target: { value: 'web-speech' } });
  return dialog;
};

test('starts in a simple, high-contrast ReazonSpeech experience', () => {
  render(<App />);
  expect(screen.getByRole('button', { name: '字幕を開始' })).toBeInTheDocument();
  expect(screen.getByText('停止中', { selector: '.live-state strong' })).toBeInTheDocument();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.getByLabelText('文字起こし表示')).toHaveClass('contrast-dark');

  const dialog = openSettings();
  expect(within(dialog).getByRole('combobox', { name: '認識方式' })).toHaveValue('reazon-speech');
  expect(within(dialog).getByRole('combobox', { name: '言語' })).toBeDisabled();
  expect(within(dialog).getByRole('meter', { name: 'マイク入力レベル' })).toHaveAttribute('aria-valuetext', '計測停止中');
});

test('keeps Web Speech available and exposes local recognition speeds', () => {
  render(<App />);
  const dialog = openSettings();
  const span = within(dialog).getByRole('combobox', { name: '字幕の更新速度' });
  expect(span).toHaveValue('standard');
  expect(span).toHaveTextContent('高速（4秒）');
  expect(span).toHaveTextContent('高精度（10秒）');
  expect(within(dialog).getByText('6秒の音声を約4秒間隔で処理します。')).toBeInTheDocument();
  expect(within(dialog).getByLabelText('ローカルモデルの状態')).toHaveTextContent('初回のみ約180MB');

  fireEvent.change(within(dialog).getByRole('combobox', { name: '認識方式' }), { target: { value: 'web-speech' } });
  expect(within(dialog).getByRole('combobox', { name: '認識方式' })).toHaveValue('web-speech');
  expect(within(dialog).getByRole('combobox', { name: '言語' })).toBeEnabled();
});

test('persists the selected recognition speed and display preferences', () => {
  render(<App />);
  const dialog = openSettings();
  fireEvent.change(within(dialog).getByRole('combobox', { name: '字幕の更新速度' }), { target: { value: 'fast' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /黄色い文字/ }));
  fireEvent.click(within(dialog).getByRole('button', { name: '最新1行' }));
  expect(within(dialog).getByRole('combobox', { name: '字幕の更新速度' })).toHaveValue('fast');
  expect(window.localStorage.getItem('hear-assist:recognition-span')).toBe('"fast"');
  expect(window.localStorage.getItem('hear-assist:contrast')).toBe('"yellow"');
});

test('diagnoses sound that is not classified as speech', () => {
  render(<App />);
  const dialog = selectWebSpeech();
  act(() => {
    mockRecognition.dispatchEvent(new Event('start'));
    mockRecognition.dispatchEvent(new Event('soundstart'));
  });
  expect(within(dialog).getByText('音声入力を検出しました。発話判定を待っています。')).toBeInTheDocument();
  const progress = within(within(dialog).getByLabelText('認識処理の進行状況'));
  expect(progress.getByText(/入力音/)).toHaveClass('is-complete');
  expect(progress.getByText(/発話判定/)).not.toHaveClass('is-complete');

  act(() => mockRecognition.dispatchEvent(new Event('end')));
  expect(within(dialog).getAllByText('音は届いていますが、発話として判定されませんでした。')).toHaveLength(2);
});

test('diagnoses speech that does not produce a recognition result', () => {
  render(<App />);
  const dialog = selectWebSpeech();
  act(() => {
    mockRecognition.dispatchEvent(new Event('start'));
    mockRecognition.dispatchEvent(new Event('soundstart'));
    mockRecognition.dispatchEvent(new Event('speechstart'));
    mockRecognition.dispatchEvent(new Event('end'));
  });
  expect(within(dialog).getAllByText('発話は検出されましたが、認識結果が返りませんでした。')).toHaveLength(2);
});

test('records no-match and recognition errors in the diagnostic log', () => {
  render(<App />);
  const dialog = selectWebSpeech();
  act(() => {
    mockRecognition.dispatchEvent(new Event('start'));
    mockRecognition.dispatchEvent(new Event('nomatch'));
  });
  const errorEvent = new Event('error');
  Object.defineProperty(errorEvent, 'error', { value: 'no-speech' });
  act(() => mockRecognition.dispatchEvent(errorEvent));
  expect(within(dialog).getByText('音声認識エラー: no-speech')).toBeInTheDocument();
  expect(within(dialog).getByText('nomatch')).toBeInTheDocument();
  expect(within(dialog).getByText('error')).toBeInTheDocument();
});

test('keeps the latest diagnosis visible across automatic Web Speech restarts', () => {
  render(<App />);
  const dialog = selectWebSpeech();
  act(() => {
    mockRecognition.dispatchEvent(new Event('start'));
    mockRecognition.dispatchEvent(new Event('soundstart'));
    mockRecognition.dispatchEvent(new Event('end'));
    mockRecognition.dispatchEvent(new Event('start'));
  });
  expect(within(dialog).getByText(/直近の判定/).closest('p')).toHaveTextContent('音は届いていますが、発話として判定されませんでした。');
});
