import type { KeyboardEvent, ReactNode, DragEventHandler } from 'react';
import KanbanPill from './KanbanPill';

export interface KanbanAvatar {
  initials: string;
  label: string;
}

export interface KanbanActivity {
  state: 'overdue' | 'today' | 'future' | 'none';
  label: string;
}

export default function KanbanCard({
  pills = [],
  meta,
  metaTitle,
  title,
  titleTitle,
  footerLeft,
  footerRight,
  avatar,
  activity,
  controls,
  onActivate,
  onDragStart,
  onDragEnd,
  draggable = false,
  ariaLabel,
  testId,
  titleTestId,
  metaTestId,
  pillsTestId,
  footerTestId,
  dataAttributes,
  className = '',
}: {
  pills?: ReactNode[];
  meta: ReactNode;
  metaTitle?: string;
  title: ReactNode;
  titleTitle?: string;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
  avatar?: KanbanAvatar;
  activity?: KanbanActivity;
  controls?: ReactNode;
  onActivate: (card: HTMLElement) => void;
  onDragStart?: DragEventHandler<HTMLElement>;
  onDragEnd?: DragEventHandler<HTMLElement>;
  draggable?: boolean;
  ariaLabel?: string;
  testId?: string;
  titleTestId?: string;
  metaTestId?: string;
  pillsTestId?: string;
  footerTestId?: string;
  dataAttributes?: Record<`data-${string}`, string | number | undefined>;
  className?: string;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    onActivate(event.currentTarget);
  };

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      data-testid={testId}
      {...dataAttributes}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('button, a, input, select, [role="menu"]')) return;
        onActivate(event.currentTarget);
      }}
      onKeyDown={handleKeyDown}
      className={`kanban-card ${className}`}
    >
      <div className="kanban-card__top">
        <div data-testid={pillsTestId} className="kanban-card__pills">
          {pills.filter(Boolean).slice(0, 2).map((pill, index) => (
            <span className="kanban-card__pill-slot" key={index}>{pill}</span>
          ))}
        </div>
        <div className="kanban-card__top-right">
          {avatar && <span className="kanban-card__avatar" title={avatar.label} aria-label={`Owner: ${avatar.label}`}>{avatar.initials}</span>}
          {activity && (
            <span
              className={`kanban-card__activity kanban-card__activity--${activity.state}`}
              title={activity.label}
              aria-label={activity.label}
            />
          )}
          {controls}
        </div>
      </div>
      <div data-testid={metaTestId} className="kanban-card__meta" title={metaTitle}>{meta}</div>
      <div data-testid={titleTestId} className="kanban-card__title" title={titleTitle}>{title}</div>
      <div className="kanban-card__divider" />
      <div data-testid={footerTestId} className="kanban-card__footer">
        <div className="kanban-card__footer-left">{footerLeft}</div>
        <div className="kanban-card__footer-right">{footerRight}</div>
      </div>
    </article>
  );
}

export { KanbanPill };
