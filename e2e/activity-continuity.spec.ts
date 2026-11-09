import { expect, test } from '@playwright/test';

test('lead activity timeline shows quotation origin and supports scheduling and completion', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/#/leads', { waitUntil: 'commit' });
  await page.getByRole('link', { name: 'Open lead details for Atoll Trading Property Renewal' }).press('Enter');

  const timeline = page.getByTestId('workspace-activity');
  await expect(timeline.getByText('Quotation', { exact: true }).first()).toBeVisible();
  await expect(timeline.getByText('Quotation request created: QR-2026-0002')).toBeVisible();

  await timeline.getByRole('button', { name: 'Schedule next activity' }).click();
  await page.getByLabel('Activity title').fill('Call about revised terms');
  await page.getByLabel('Activity type').selectOption('call');
  await page.getByLabel('Due date *').fill('2030-01-10T10:00');
  await page.getByLabel('Assignee').selectOption({ label: 'Demo Administrator' });
  await page.getByLabel('Note (optional)').fill('Confirm the premium and deductible options.');
  await page.getByRole('button', { name: 'Schedule activity' }).click();

  const scheduled = timeline.getByText('Call about revised terms');
  await expect(scheduled).toBeVisible();
  await expect(scheduled.locator('xpath=ancestor::article')).toContainText('Lead');
  await expect(scheduled.locator('xpath=ancestor::article')).toContainText('Demo Administrator');
  await timeline.getByRole('button', { name: 'Mark done' }).click();
  await expect(timeline.getByText('Done', { exact: true })).toBeVisible();
  await expect(timeline.getByRole('button', { name: 'Mark done' })).toHaveCount(0);
});

test('lead stage SLAs and stage-duration analytics are visible', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/#/leads', { waitUntil: 'commit' });
  const lead = page.getByRole('link', { name: 'Open lead details for North Harbour Cargo Cover' });
  await expect(lead).toContainText('Overdue');

  await page.goto('/#/funnels', { waitUntil: 'commit' });
  const analytics = page.getByRole('heading', { name: 'Stage duration analytics' });
  await expect(analytics).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Selected deal pipeline' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lead funnel' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Selected deal pipeline duration metrics' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Lead funnel duration metrics' })).toBeVisible();
});