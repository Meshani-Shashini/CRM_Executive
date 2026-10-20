import type { ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  layer?: 'base' | 'overlay';
}

export default function Modal({ open, onClose, title, subtitle, children, footer, size = 'md', layer = 'base' }: ModalProps) {
  if (!open) return null;
  const w = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];
  return (
    <div className={`fixed inset-0 ${layer === 'overlay' ? 'z-[60]' : 'z-50'} flex items-center justify-center p-4 animate-fadeIn`} onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className={`relative ${w} w-full glass rounded-2xl shadow-glass flex flex-col max-h-[90vh] animate-slideUp`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-5 border-b border-ink-600">
          <div>
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            {subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-ink-700 text-muted hover:text-white transition">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
        {footer && <div className="p-4 border-t border-ink-600 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
