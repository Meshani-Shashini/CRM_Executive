import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface TableRowActionsMenuProps {
  open: boolean;
  anchor: HTMLElement | null;
  label: string;
  children: ReactNode;
}

export default function TableRowActionsMenu({ open, anchor, label, children }: TableRowActionsMenuProps) {
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
        Math.min(anchorRect.right - menuRect.width, window.innerWidth - margin - menuRect.width),
      );
      setPosition({ top, left });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchor, open]);

  if (!open || !anchor) return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      className="table-row-actions-menu rounded-lg border border-ink-600 bg-ink-900 p-1 text-left shadow-xl"
      style={{ top: position?.top ?? 0, left: position?.left ?? 0, visibility: position ? 'visible' : 'hidden' }}
    >
      {children}
    </div>,
    document.body,
  );
}
