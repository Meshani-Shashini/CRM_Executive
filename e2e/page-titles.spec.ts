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
    description: 'Stage entries and conversion rates calculated from deal stage history.',
  },
  {
    route: 'pipelines',
    title: 'Pipelines',
    description: 'Move opportunities through configured insurance stages.',
  },
];

test('compact page titles keep descriptions in the app-header tooltip', async ({ page }) => {
  for (const { route, title, description } of pages) {
    await page.goto(`/#/${route}`);
    await expect(page.getByRole('banner').getByRole('heading', { name: title, exact: true })).toBeVisible();
    const infoButton = page.getByRole('banner').getByRole('button', { name: description, exact: true });
    await expect(infoButton).toHaveAttribute('title', description);
    await infoButton.focus();
    await expect(page.getByRole('tooltip')).toHaveText(description);
    await expect(page.getByRole('main').getByText(description, { exact: true })).toHaveCount(0);
    await expect(page.getByRole('main').getByRole('heading', { name: title, exact: true })).toHaveCount(0);
  }
});
