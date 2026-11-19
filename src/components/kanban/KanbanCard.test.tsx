// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import KanbanCard, { KanbanPill } from './KanbanCard';

describe('KanbanCard slots', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders the shared content slots and limits the pill row to two items', () => {
    act(() => root.render(
      <KanbanCard
        pills={[
          <KanbanPill key="status" tone="blue">Open</KanbanPill>,
          <KanbanPill key="product" tone="muted">Property</KanbanPill>,
          <KanbanPill key="extra">Extra</KanbanPill>,
        ]}
        meta="Northwind"
        title="Property placement"
        footerLeft="Nov 20"
        footerRight="MVR 1,200"
        avatar={{ initials: 'NW', label: 'Nina Wells' }}
        activity={{ state: 'future', label: 'Review tomorrow' }}
        onActivate={vi.fn()}
      />,
    ));

    expect(container.querySelectorAll('.kanban-card__pill-slot')).toHaveLength(2);
    expect(container.querySelector('.kanban-card__meta')?.textContent).toBe('Northwind');
    expect(container.querySelector('.kanban-card__title')?.textContent).toBe('Property placement');
    expect(container.querySelector('.kanban-card__footer-left')?.textContent).toBe('Nov 20');
    expect(container.querySelector('.kanban-card__footer-right')?.textContent).toBe('MVR 1,200');
    expect(container.querySelector('.kanban-card__avatar')?.getAttribute('aria-label')).toBe('Owner: Nina Wells');
    expect(container.querySelector('.kanban-card__activity')?.getAttribute('aria-label')).toBe('Review tomorrow');
  });

  it('activates with Enter and Space while keeping nested controls separate', () => {
    const onActivate = vi.fn();
    act(() => root.render(
      <KanbanCard
        pills={[<button key="control" type="button">Temperature</button>]}
        meta="Northwind"
        title="Property placement"
        onActivate={onActivate}
      />,
    ));

    const card = container.querySelector<HTMLElement>('.kanban-card');
    const control = container.querySelector<HTMLButtonElement>('button');
    expect(card).not.toBeNull();
    expect(control).not.toBeNull();
    act(() => card?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    act(() => card?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })));
    act(() => control?.click());
    expect(onActivate).toHaveBeenCalledTimes(2);
  });
});
