import type { ReactNode } from 'react';

export default function KanbanBoard({
  children,
  ariaLabel = 'Kanban board',
  testId,
  className = '',
}: {
  children: ReactNode;
  ariaLabel?: string;
  testId?: string;
  className?: string;
}) {
  return (
    <div
      role="region"
      aria-label={ariaLabel}
      data-testid={testId}
      className={`kanban-board ${className}`}
    >
      {children}
    </div>
  );
}
