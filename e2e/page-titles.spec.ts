import { expect, test } from '@playwright/test';

const pages = [
  {
    route: 'vendors',
    title: 'Vendors',
    description: 'Insurers, reinsurers, surveyors, and loss adjusters managed as active broker-side vendor records.',
  },
  {
    route: 'calendar',
    title: 'Calendar',
    description: 'Read-only schedule derived from activities, records, renewals, and SLAs.',
  },
  {
    route: 'qslips',
    title: 'Quotation Request Slips',
    description: 'Track market requests linked to open deals.',
  },
  {
    route: 'renewals',
    title: 'Renewals',
    description: 'Policies due now or within the next 120 days, derived from existing records.',
  },
  {
    route: 'funnels',
    title: 'Funnels',
    duplicateTitle: 'Pipeline Funnels',
    description: 'Stage entries and conversion rates calculated from deal stage history.',
  },
  {
    route: 'pipelines',
    title: 'Pipelines',
    duplicateTitle: 'Insurance Pipelines',
    description: 'Move opportunities through configured insurance stages.',
  },
  {
    route: 'mira',
    title: 'MIRA Form 1 — Business Written',
    duplicateTitle: 'MIRA Form 1 — Summary of Business Written',
    description: 'Maldives Inland Revenue Authority · statutory regulatory export',
  },
  {
    route: 'plans',
    title: 'My Plans',
    description: 'Sales targets and personal plan tracking.',
  },
];

test('primary pages show one visible page title with their description', async ({ page }) => {
  for (const { route, title, duplicateTitle = title, description } of pages) {
    await page.goto(`/#/${route}`);
    await expect(page.getByRole('banner').getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.getByRole('main').getByRole('heading', { name: duplicateTitle, exact: true })).toHaveCount(0);
    await expect(page.getByRole('main').getByText(description, { exact: true })).toBeVisible();
  }
});
