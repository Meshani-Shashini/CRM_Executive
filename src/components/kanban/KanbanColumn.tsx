import type { DragEventHandler, ReactNode } from 'react';
import KanbanPill from './KanbanPill';

export default function KanbanColumn({
  name,
  count,
  summary,
  emptyLabel,
  emptyMessage,
  children,
  onDragOver,
  onDrop,
  testId,
  headerTestId,
  bodyTestId,
  className = '',
}: {
  name: string;
  count: number;
  summary: string;
  emptyLabel: string;
  emptyMessage?: string;
  children: ReactNode;
  onDragOver?: DragEventHandler<HTMLElement>;
  onDrop?: DragEventHandler<HTMLElement>;
  testId?: string;
  headerTestId?: string;
  bodyTestId?: string;
  className?: string;
}) {
  const isEmpty = !children || (Array.isArray(children) && children.length === 0);

  return (
    <section
      role="group"
      data-testid={testId}
      aria-label={`${name}, ${count} ${emptyLabel}`}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`kanban-column ${className}`}
    >
      <header data-testid={headerTestId} className="kanban-column__header">
        <div className="kanban-column__heading">
          <h2 className="kanban-column__name" title={name}>{name}</h2>
          <KanbanPill tone="muted">{count}</KanbanPill>
        </div>
        <p className="kanban-column__summary" title={summary}>{summary}</p>
      </header>
      <div data-testid={bodyTestId} className="kanban-column__body">
        {isEmpty
          ? <p className="kanban-column__empty">{emptyMessage ?? `No ${emptyLabel} in this stage`}</p>
          : children}
      </div>
    </section>
  );
}
