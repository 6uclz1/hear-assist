import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AutoScrollingText from './AutoScrollingText';

test('highlights the latest transcript chunk', () => {
  render(
    <AutoScrollingText
      text="ひとつ前の字幕 最新の字幕"
      highlightedText="最新の字幕"
      active
      status={{ tone: 'live', label: '認識中', detail: '端末内で処理しています' }}
    />,
  );

  expect(screen.getByText('最新の字幕').tagName).toBe('MARK');
  expect(screen.getByText('認識中')).toBeInTheDocument();
});

test('opens and closes the fullscreen subtitle presentation', () => {
  render(<AutoScrollingText text="字幕" />);
  const viewer = screen.getByLabelText('文字起こし表示');

  expect(screen.getByText('Hear Assist')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '全面' }));
  expect(viewer).toHaveClass('is-fullscreen');

  fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
  expect(viewer).not.toHaveClass('is-fullscreen');
});

test('keeps recognition delay and last-caption age visible', () => {
  render(
    <AutoScrollingText
      text="表示中の字幕"
      active
      status={{ tone: 'delayed', label: '認識が遅れています', detail: '最新の会話へ追いついています' }}
      lastRecognitionLabel="8秒前"
      focus="two"
    />,
  );
  expect(screen.getAllByText('認識が遅れています')).toHaveLength(2);
  expect(screen.getByText('8秒前')).toBeInTheDocument();
  expect(screen.getByText('表示中の字幕').closest('.caption-canvas')).toHaveClass('focus-two');
});


test('shows the live RMS input level with an understandable label', () => {
  render(
    <AutoScrollingText
      text=""
      active
      inputLevel={{ rms: 0.125, db: -18, level: 70 }}
    />,
  );

  expect(screen.getByText('RMS 0.125')).toBeInTheDocument();
  expect(screen.getByText('-18 dBFS')).toBeInTheDocument();
  expect(screen.getByText('適正')).toBeInTheDocument();
  expect(screen.getByRole('meter', { name: 'RMS入力レベル' })).toHaveAttribute('aria-valuetext', '適正、RMS 0.125、-18 dBFS');
});
