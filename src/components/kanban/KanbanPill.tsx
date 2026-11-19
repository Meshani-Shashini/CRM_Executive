import type { ReactNode } from 'react';

export type KanbanPillTone = 'blue' | 'green' | 'red' | 'amber' | 'purple' | 'muted' | 'brand';

const toneClasses: Record<KanbanPillTone, string> = {
  blue: 'kanban-pill--blue',
  green: 'kanban-pill--green',
  red: 'kanban-pill--red',
  amber: 'kanban-pill--amber',
  purple: 'kanban-pill--purple',
  muted: 'kanban-pill--muted',
  brand: 'kanban-pill--brand',
};

export default function KanbanPill({
  children,
  tone = 'muted',
  title,
}: {
  children: ReactNode;
  tone?: KanbanPillTone;
  title?: string;
}) {
  return <span className={`kanban-pill ${toneClasses[tone]}`} title={title}>{children}</span>;
}
