// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUseApp } = vi.hoisted(() => ({ mockUseApp: vi.fn() }));
vi.mock('../store/AppContext', () => ({ useApp: mockUseApp }));

import ReportsPage from './ReportsPage';

describe('Reports page', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockUseApp.mockReturnValue({
      dataReady: true,
      pipelines: [{ id: 'pipeline-1', tenantId: 'tenant-1', name: 'Commercial', code: 'COMMERCIAL', isActive: true }],
      pipelineStages: [
        { id: 'stage-lead', pipelineId: 'pipeline-1', name: 'Lead', stageOrder: 1, winProbabilityPct: 10, stagnationDaysThreshold: 5 },
        { id: 'stage-qualified', pipelineId: 'pipeline-1', name: 'Qualified', stageOrder: 2, winProbabilityPct: 30, stagnationDaysThreshold: 5 },
        { id: 'stage-won', pipelineId: 'pipeline-1', name: 'Won', stageOrder: 3, winProbabilityPct: 100, stagnationDaysThreshold: 0, isClosedWon: true },
      ],
      deals: [
        { id: 'deal-lead', pipelineId: 'pipeline-1', client: 'Acme', product: 'Property', value: 7000, weighted: 700, currency: 'MVR', stage: 'Lead', probability: 10, ownerId: 'user-1', closeDate: '', insurer: '', leadId: 'lead-1' },
        { id: 'deal-qualified', pipelineId: 'pipeline-1', client: 'Northwind', product: 'Property', value: 2000, weighted: 600, currency: 'USD', exchangeRate: 15.4, stage: 'Qualified', probability: 30, ownerId: 'user-1', closeDate: '', insurer: '', leadId: 'lead-2' },
        { id: 'deal-won', pipelineId: 'pipeline-1', client: 'Won Co', product: 'Property', value: 50000, weighted: 50000, currency: 'MVR', stage: 'Won', probability: 100, ownerId: 'user-1', closeDate: '', insurer: '', leadId: 'lead-3', disposition: 'won' },
      ],
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    mockUseApp.mockReset();
  });

  it('shows report tabs and compact open value by stage, excluding closed deals', () => {
    act(() => root.render(<ReportsPage />));

    const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Funnel', 'Win rate', 'Deal cycle', 'Forecast', 'Leaderboard', 'Lost reasons', 'Competitors', 'CLV',
    ]);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(container.textContent).toContain('Open pipeline by stage');
    expect(container.textContent).toContain('1 · 7k');
    expect(container.textContent).toContain('1 · 30.8k');
    expect(container.textContent).not.toContain('50k');
    expect(container.querySelectorAll('[role="progressbar"]')).toHaveLength(2);
  });

  it('updates the active tab and panel when another report is selected', () => {
    act(() => root.render(<ReportsPage />));
    const forecastTab = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
      .find((tab) => tab.textContent === 'Forecast');

    act(() => forecastTab?.click());

    expect(forecastTab?.getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('[role="tabpanel"]')?.getAttribute('aria-labelledby')).toBe('report-tab-forecast');
    expect(container.textContent).toContain('This report view is not available yet.');
  });
});
