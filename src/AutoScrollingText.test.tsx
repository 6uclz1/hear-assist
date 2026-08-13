import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AutoScrollingText from './AutoScrollingText';

window.HTMLElement.prototype.scrollTo = jest.fn();

test('highlights the latest transcript chunk', () => {
  render(
    <AutoScrollingText
      text="ひとつ前の字幕 最新の字幕"
      highlightedText="最新の字幕"
      listening
    />,
  );

  expect(screen.getByText('最新の字幕').tagName).toBe('MARK');
  expect(screen.getByText('● 認識中')).toBeInTheDocument();
});

test('opens and closes the fullscreen subtitle presentation', () => {
  render(<AutoScrollingText text="字幕" />);
  const viewer = screen.getByLabelText('文字起こし表示');

  fireEvent.click(screen.getByRole('button', { name: '全面表示' }));
  expect(viewer).toHaveClass('is-fullscreen');

  fireEvent.click(screen.getByRole('button', { name: '全面表示を閉じる' }));
  expect(viewer).not.toHaveClass('is-fullscreen');
});
