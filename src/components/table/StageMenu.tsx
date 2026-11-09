import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { PipelineStage } from '../../types';

interface StageMenuProps {
  open: boolean;
  anchor: HTMLButtonElement | null;
  label: string;
  stages: PipelineStage[];
  onClose: () => void;
  onSelect: (stage: PipelineStage) => void;
}

export default function StageMenu({ open, anchor, label, stages, onClose, onSelect }: StageMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const updatePosition = () => {
      const menu = menuRef.current;
      if (!menu) return;
      const anchorRect = anchor.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const margin = 12;
      const gap = 4;
      const fitsBelow = anchorRect.bottom + gap + menuRect.height <= window.innerHeight - margin;
      const fitsAbove = anchorRect.top - gap - menuRect.height >= margin;
      const top = fitsBelow
        ? anchorRect.bottom + gap
        : fitsAbove
          ? anchorRect.top - gap - menuRect.height
          : Math.max(margin, Math.min(anchorRect.bottom + gap, window.innerHeight - margin - menuRect.height));
      const left = Math.max(
        margin,
        Math.min(anchorRect.left, window.innerWidth - margin - menuRect.width),
      );
      setPosition({ top, left });
    };

    updatePosition();
    const focusFrame = window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    });
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchor, open, stages.length]);

  useEffect(() => {
    if (!open || !anchor) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || menuRef.current?.contains(target) || anchor.contains(target)) return;
      onClose();
    };
    document.addEventListener('pointerdown', closeOnOutsideClick, true);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick, true);
  }, [anchor, onClose, open]);

  if (!open || !anchor) return null;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      anchor.focus();
      onClose();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const nextIndex = currentIndex < 0
        ? 0
        : (currentIndex + direction + items.length) % items.length;
      items[nextIndex]?.focus();
    } else if (event.key === 'Enter' && currentIndex >= 0) {
      event.preventDefault();
      items[currentIndex]?.click();
    }
  };

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      className="deal-stage-menu rounded-lg border border-ink-600 bg-ink-900 p-1 text-left shadow-xl"
      onKeyDown={handleKeyDown}
      style={{ top: position?.top ?? 0, left: position?.left ?? 0, visibility: position ? 'visible' : 'hidden' }}
    >
      {stages.map((stage) => (
        <button
          key={stage.id}
          type="button"
          role="menuitem"
          data-pipeline-id={stage.pipelineId}
          className="deal-stage-menu-item text-[#E1E2E5] hover:bg-ink-700"
          title={stage.name}
          onClick={(event) => {
            event.stopPropagation();
            anchor.focus();
            onSelect(stage);
          }}
        >
          {stage.name}
        </button>
      ))}
    </div>,
    document.body,
  );
}
