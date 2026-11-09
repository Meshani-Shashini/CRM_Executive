import type { ReactNode } from 'react';

export default function TableShell({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`fit-wrap w-full max-w-full min-w-0 rounded-lg border border-[#1B1E22] bg-ink-950 ${className}`}>{children}</div>;
}
