import type { ReactNode } from 'react';

interface PageToolbarProps {
  children: ReactNode;
  name?: string;
  testId?: string;
  className?: string;
}

export default function PageToolbar({ children, name, testId, className = '' }: PageToolbarProps) {
  return (
    <div
      data-page-toolbar={name}
      data-testid={testId}
      className={`page-toolbar flex min-w-0 flex-wrap items-center gap-2 ${className}`}
    >
      {children}
    </div>
  );
}