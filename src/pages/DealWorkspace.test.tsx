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
      company: { requireNextActivityForStageChange: false },
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.location.hash = '';
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

  it('renders the requested Deals list fields in order', () => {
    window.location.hash = '#/deals?view=list';
    act(() => root.render(<DealWorkspace deals={[testDeal]} dealsPageMode />));

    expect([...container.querySelectorAll('thead th')].map((cell) => cell.textContent?.trim().replace(/[↑↓]/g, ''))).toEqual([
      'Deal',
      'Value',
      'Client',
      'Contact',
      'Expected Close',
      'Next Activity',
      'Owner',
      'Stage',
      'Pipeline',
      'Actions',
    ]);
    expect(container.querySelector('thead th[aria-sort="ascending"]')?.textContent).toContain('Expected Close');
    expect(container.querySelector('thead th[aria-sort="ascending"] [aria-hidden="true"]')).toBeNull();
    expect(container.querySelector('thead th[aria-sort="ascending"] button')?.getAttribute('aria-label')).toBe('Sort by Expected Close Date');
  });

  it('shows a sort arrow only after sorting is changed by the user', () => {
    window.location.hash = '#/deals?view=list';
    act(() => root.render(<DealWorkspace deals={[testDeal]} dealsPageMode />));

    expect(container.querySelectorAll('thead th [aria-hidden="true"]')).toHaveLength(0);
    act(() => container.querySelector<HTMLButtonElement>('thead th button[aria-label="Sort by Expected Close Date"]')?.click());

    expect(container.querySelector('thead th[aria-sort="descending"] [aria-hidden="true"]')?.textContent).toBe('↓');
    expect(container.querySelectorAll('thead th [aria-hidden="true"]')).toHaveLength(1);
  });

  it('omits the Open status from the deal action menu', () => {
    window.location.hash = '#/deals?view=list';
    act(() => root.render(<DealWorkspace deals={[testDeal]} dealsPageMode />));
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Actions for Property placement"]')?.click());

    const menu = document.body.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
    expect(menu?.textContent).not.toContain('Open');
    expect([...menu!.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent?.trim())).toContain('Mark won');
  });

  it('defaults to the List view and orders Deals tabs to match Leads', () => {
    window.location.hash = '#/deals';
    act(() => root.render(<DealWorkspace deals={[testDeal]} dealsPageMode />));

    const viewTabs = [...container.querySelectorAll<HTMLButtonElement>('[data-deals-view]')];
    expect(viewTabs.map((tab) => tab.getAttribute('data-deals-view'))).toEqual([
      'list',
      'pipeline',
      'forecast',
      'archive',
    ]);
    expect(container.querySelector('[data-testid="deals-toolbar"]')?.className).toContain('flex-wrap');
    expect(viewTabs[0].getAttribute('aria-selected')).toBe('true');
    expect(viewTabs.slice(1).every((tab) => tab.getAttribute('aria-selected') === 'false')).toBe(true);
    expect(viewTabs[0].className).toContain('bg-[#1B1E22]');
  });
});
