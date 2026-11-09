// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUseApp } = vi.hoisted(() => ({ mockUseApp: vi.fn() }));
vi.mock('../store/AppContext', () => ({ useApp: mockUseApp }));

import DealWorkspace from './DealWorkspace';

const testDeal = {
  id: 'deal-1',
  pipelineId: 'pipeline-1',
  client: 'Acme',
  product: 'Property',
  productCode: 'PR',
  value: 1000,
  weighted: 100,
  currency: 'MVR' as const,
  stage: 'New',
  probability: 10,
  ownerId: 'user-1',
  closeDate: '2025-12-01',
  insurer: 'Not assigned',
  leadId: 'lead-1',
  createdAt: '2025-01-01T00:00:00.000Z',
};

describe('Deal list row accessibility', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockUseApp.mockReturnValue({
      activities: [], setActivities: vi.fn(), clients: [], setClients: vi.fn(),
      deals: [testDeal], setDeals: vi.fn(), leads: [], setLeads: vi.fn(),
      products: [], pipelines: [{ id: 'pipeline-1', tenantId: 'tenant-1', name: 'Commercial', code: 'COMMERCIAL', isActive: true }],
      pipelineStages: [{ id: 'stage-1', pipelineId: 'pipeline-1', name: 'New', stageOrder: 1, winProbabilityPct: 10, stagnationDaysThreshold: 5 }],
      stageHistory: [], setStageHistory: vi.fn(), invoices: [], setInvoices: vi.fn(),
      user: { id: 'user-1', name: 'QA User', email: 'qa@example.com', role: 'sales' },
      users: [], vendors: [], viewAsRole: null, quotationRequests: [],
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    mockUseApp.mockReset();
  });

  it.each(['Enter', ' '])('exposes named deal links and activates them with %s', (key) => {
    act(() => root.render(<DealWorkspace deals={[testDeal]} />));
    const row = container.querySelector('tr[role="link"]');
    expect(row?.getAttribute('aria-label')).toBe('Open deal details for Property placement');
    expect(row?.getAttribute('tabindex')).toBe('0');

    act(() => row?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
    expect(container.querySelector('tr[role="link"]')).toBeNull();
  });

  it('shows a back button in the detail toolbar and returns to the caller', () => {
    const onClose = vi.fn();
    act(() => root.render(<DealWorkspace deals={[testDeal]} onClose={onClose} />));
    const row = container.querySelector<HTMLTableRowElement>('tr[role="link"]');
    act(() => row?.click());

    const backButton = container.querySelector<HTMLButtonElement>('button[aria-label="Back to leads"]');
    expect(backButton).not.toBeNull();
    act(() => backButton?.click());
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows an empty Inspection state without a record selector when nothing is selected', () => {
    act(() => root.render(<DealWorkspace deals={[testDeal]} />));
    const viewTabs = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    act(() => viewTabs[2]?.click());

    expect(container.textContent).toContain('No record selected');
    expect(container.querySelector('button[aria-label="Search deals and leads"]')).toBeNull();
    expect(container.textContent).not.toContain('Deals & Leads');
    expect(container.textContent).not.toContain('Lead 360');
    expect(container.textContent).toContain('Go to List');
  });
});
