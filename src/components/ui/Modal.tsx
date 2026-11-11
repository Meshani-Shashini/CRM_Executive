import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

type ModalLayer = 'base' | 'overlay';

const openModals: Array<{ element: HTMLDivElement; layer: ModalLayer }> = [];

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  layer?: ModalLayer;
}

export default function Modal({ open, onClose, title, subtitle, children, footer, size = 'md', layer = 'base' }: ModalProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open || !rootRef.current) return undefined;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = rootRef.current;
    openModals.push({ element, layer });
    const handleKeyDown = (event: KeyboardEvent) => {
      const topModal = openModals.reduce<{ element: HTMLDivElement; layer: ModalLayer } | undefined>(
        (top, modal) => !top || modal.layer === 'overlay' || top.layer === 'base' ? modal : top,
        undefined,
      );
      if (event.key === 'Escape' && topModal?.element === element) {
        event.preventDefault();
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const index = openModals.findIndex((modal) => modal.element === element);
      if (index >= 0) openModals.splice(index, 1);
      if (openerRef.current?.isConnected) openerRef.current.focus();
    };
  }, [layer, open]);

  if (!open) return null;
  const w = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];
  return (
    <div ref={rootRef} className={`fixed inset-0 ${layer === 'overlay' ? 'z-[90]' : 'z-[80]'} flex items-center justify-center p-4 animate-fadeIn`}
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className={`relative ${w} w-full glass rounded-2xl shadow-glass flex flex-col max-h-[90vh] animate-slideUp`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between p-5 border-b border-ink-600">
          <div>
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            {subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-ink-700 text-muted hover:text-white transition">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex shrink-0 justify-end gap-2 border-t border-ink-600 p-4">{footer}</div>}
      </div>
    </div>
  );
}
