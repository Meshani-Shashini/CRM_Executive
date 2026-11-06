// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Modal from './Modal';

describe('Modal keyboard and focus behavior', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('closes on Escape and restores focus to the opener', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const onClose = vi.fn();

    act(() => {
      root.render(<Modal open onClose={onClose} title="Test modal">Content</Modal>);
    });
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(onClose).toHaveBeenCalledOnce();

    act(() => {
      root.render(<Modal open={false} onClose={onClose} title="Test modal">Content</Modal>);
    });
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('does not close a base modal while a nested overlay is open', () => {
    const baseOnClose = vi.fn();
    const overlayOnClose = vi.fn();
    act(() => {
      root.render(
        <>
          <Modal open onClose={baseOnClose} title="Base">Base content</Modal>
          <Modal open layer="overlay" onClose={overlayOnClose} title="Overlay">Overlay content</Modal>
        </>,
      );
    });

    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(overlayOnClose).toHaveBeenCalledOnce();
    expect(baseOnClose).not.toHaveBeenCalled();
  });
});
