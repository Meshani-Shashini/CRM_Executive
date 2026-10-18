import type { ReactNode } from 'react';
import { Construction } from 'lucide-react';

export default function Placeholder({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="glass rounded-2xl p-8 max-w-lg text-center">
        <div className="w-14 h-14 rounded-full bg-brand-400/10 border border-brand-400/30 flex items-center justify-center mx-auto mb-4">
          <Construction size={24} className="text-brand-400" />
        </div>
        <h2 className="text-xl font-bold text-white">{title}</h2>
        {subtitle && <p className="text-sm text-muted mt-2">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}
