// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEAL_PIPELINE_STAGES } from '../data/pipelineStageTemplates';

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
      pipelineStages: [
        { id: 'stage-1', pipelineId: 'pipeline-1', name: 'New', stageOrder: 1, winProbabilityPct: 10, stagnationDaysThreshold: 5 },
        { id: 'stage-2', pipelineId: 'pipeline-1', name: 'Key Person Identified', shortLabel: 'Key Person Identified', stageOrder: 2, winProbabilityPct: 30, stagnationDaysThreshold: 5 },
      ],
      stageHistory: [], setStageHistory: vi.fn(), invoices: [], setInvoices: vi.fn(),
      user: { id: 'user-1', name: 'QA User', email: 'qa@example.com', role: 'sales' },
      users: [], vendors: [], viewAsRole: null, quotationRequests: [], clientQuotations: [],
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

  it('routes lead detail view icons back to the primary Leads views without rendering the legacy workspace tabs', () => {
    mockUseApp.mockReturnValue({
      activities: [], setActivities: vi.fn(), clients: [], setClients: vi.fn(),
      deals: [], setDeals: vi.fn(), leads: [{
        id: 'lead-1',
        client: 'Acme',
        title: 'Acme lead',
        contact: 'A Contact',
        country: 'Maldives',
        insuranceClass: 'Property',
        productCode: 'PR',
        temperature: 'WARM',
        status: 'IN-PROGRESS',
        funnelStage: 'Lead Identified',
        renewalDate: '',
        sumInsured: 1000,
        premium: 0,
        ownerId: 'user-1',
        lastActivity: '',
      }], setLeads: vi.fn(), products: [], pipelines: [], pipelineStages: [],
      stageHistory: [], setStageHistory: vi.fn(), invoices: [], setInvoices: vi.fn(),
      user: { id: 'user-1', name: 'QA User', email: 'qa@example.com', role: 'sales' },
      users: [], vendors: [], viewAsRole: null, quotationRequests: [], clientQuotations: [],
      company: { requireNextActivityForStageChange: false },
    });
    const onLeadViewChange = vi.fn();

    act(() => root.render(<DealWorkspace
      deals={[]}
      initialSelectedKey="lead:lead-1"
      onLeadViewChange={onLeadViewChange}
    />));

    const viewButtons = [...container.querySelectorAll<HTMLButtonElement>('[data-view-option]')];
    expect(viewButtons.map((button) => button.getAttribute('data-view-option'))).toEqual(['list', 'kanban']);
    expect(container.textContent).not.toContain('Deals pipeline');
    expect(container.textContent).not.toContain('Inspection');

    act(() => viewButtons[0].click());
    act(() => viewButtons[1].click());
    expect(onLeadViewChange.mock.calls).toEqual([['list'], ['kanban']]);
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
    act(() => root.render(<DealWorkspace deals={[{ ...testDeal, stage: 'Key Person Identified' }]} dealsPageMode />));

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
    const stageBadge = container.querySelector<HTMLSpanElement>('td[data-label="Stage"] .deal-stage-trigger > span:first-child');
    const pipelineBadge = container.querySelector<HTMLSpanElement>('td[data-label="Pipeline"] > span');
    expect(stageBadge?.textContent).toBe('Key Person Identified');
    expect(stageBadge?.className).toContain('px-1.5 py-0.5 text-[10px] font-normal leading-tight');
    expect(stageBadge?.className).toContain('break-words');
    expect(pipelineBadge?.className).toContain('px-1.5 py-0.5 text-[10px] font-normal leading-tight');
    expect(container.querySelector('.deal-stage-sla')?.textContent).toContain('/5d');
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

    const viewTabs = [...container.querySelectorAll<HTMLButtonElement>('[data-view-option]')];
    expect(viewTabs.map((tab) => tab.getAttribute('data-view-option'))).toEqual([
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

  it('groups the Deals Kanban by the fixed stages and filters deals by pipeline', () => {
    window.location.hash = '#/deals?view=pipeline';
    const pipelines = [
      { id: 'pipeline-1', tenantId: 'tenant-1', name: 'Commercial Lines Brokerage', code: 'COMMERCIAL', isActive: true },
      { id: 'pipeline-2', tenantId: 'tenant-1', name: 'Retail, SME & Velocity Packages', code: 'SME_VELOCITY', isActive: true },
    ];
    const stages = pipelines.flatMap((pipeline) => DEAL_PIPELINE_STAGES.map((stage, index) => ({
      ...stage,
      id: `${pipeline.id}-stage-${index + 1}`,
      pipelineId: pipeline.id,
      stageOrder: index + 1,
    })));
    const deals = [
      { ...testDeal, id: 'deal-commercial', pipelineId: 'pipeline-1', stage: 'Identified', value: 1000 },
      { ...testDeal, id: 'deal-sme', pipelineId: 'pipeline-2', stage: 'Identified', value: 2000 },
    ];
    mockUseApp.mockReturnValue({
      activities: [], setActivities: vi.fn(), clients: [], setClients: vi.fn(),
      deals, setDeals: vi.fn(), leads: [], setLeads: vi.fn(), products: [], pipelines, pipelineStages: stages,
      stageHistory: [], setStageHistory: vi.fn(), invoices: [], setInvoices: vi.fn(),
      user: { id: 'user-1', name: 'QA User', email: 'qa@example.com', role: 'sales' },
      users: [], vendors: [], viewAsRole: null, quotationRequests: [], clientQuotations: [],
      company: { requireNextActivityForStageChange: false },
    });

    act(() => root.render(<DealWorkspace deals={deals} dealsPageMode />));

    const findIdentifiedColumn = () => [...container.querySelectorAll<HTMLElement>('section[data-testid="deals-kanban-column"]')]
      .find((column) => column.querySelector('.kanban-column__name')?.textContent === 'Identified');
    expect(container.querySelectorAll('section[data-testid="deals-kanban-column"]')).toHaveLength(9);
    const identifiedColumn = findIdentifiedColumn();
    expect(identifiedColumn?.querySelector('.kanban-column__summary')?.textContent).toBe('MVR 3,000.00 - 2 deals');
    expect(identifiedColumn?.querySelectorAll('article[data-deal-id]')).toHaveLength(2);
    const commercialCard = identifiedColumn?.querySelector<HTMLElement>('article[data-deal-id="deal-commercial"]');
    expect(commercialCard?.textContent).toContain('OPEN');
    expect(commercialCard?.textContent).toContain('PR');
    expect(commercialCard?.textContent).toContain('Acme');
    expect(commercialCard?.textContent).toContain('Property placement');
    expect(commercialCard?.textContent).toContain('01-Dec-2025');
    expect(commercialCard?.textContent).toContain('MVR 1,000.00');
    expect(commercialCard?.textContent).not.toContain('Commercial');
    expect(commercialCard?.getAttribute('draggable')).toBe('true');
    expect(commercialCard?.getAttribute('role')).toBe('button');
    expect(commercialCard?.getAttribute('tabindex')).toBe('0');
    expect(commercialCard?.querySelector('.kanban-card__activity')?.getAttribute('aria-label')).toBe('No activity scheduled');
    expect(commercialCard?.querySelector('.kanban-card__pill-slot')).not.toBeNull();
    expect(commercialCard?.querySelector('.kanban-card__footer-right')?.textContent).toBe('MVR 1,000.00');

    const pipelineFilter = container.querySelector<HTMLSelectElement>('select[aria-label="Filter deals by pipeline"]');
    act(() => {
      if (!pipelineFilter) throw new Error('Pipeline filter was not rendered');
      pipelineFilter.value = 'pipeline-1';
      pipelineFilter.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const filteredColumn = findIdentifiedColumn();
    expect(filteredColumn?.querySelector('.kanban-column__summary')?.textContent).toBe('MVR 1,000.00 - 1 deal');
    expect(filteredColumn?.querySelectorAll('article[data-deal-id]')).toHaveLength(1);
    expect(filteredColumn?.querySelector('article[data-deal-id="deal-sme"]')).toBeNull();
  });
});
