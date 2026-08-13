import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

window.HTMLElement.prototype.scrollTo = jest.fn();

jest.mock('react-speech-recognition', () => ({
  __esModule: true,
  default: {
    startListening: jest.fn(),
    stopListening: jest.fn(),
  },
  useSpeechRecognition: () => ({
    transcript: '',
    listening: false,
    resetTranscript: jest.fn(),
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
  expect(screen.getByRole('button', { name: '音声認識を開始' })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: '認識言語' })).toHaveValue('ja-JP');
  expect(screen.getByRole('meter', { name: 'マイク入力レベル' })).toHaveAttribute(
    'aria-valuetext',
    '計測停止中',
  );

  fireEvent.click(screen.getByRole('button', { name: '音声認識を開始' }));
  expect(await screen.findByRole('dialog')).toHaveTextContent('ワイドスペクトル');
});
