import { expect, test } from '@playwright/test';

test('lead conversion creates one linked deal and blocks a second conversion', async ({ page }) => {
  await page.goto('/#/leads');
  const title = 'North Harbour Cargo Cover';
  const row = page.getByRole('link', { name: `Open lead details for ${title}` });
  await row.getByRole('button', { name: `Actions for ${title}` }).click();
  await page.getByRole('menuitem', { name: 'Convert to Deal' }).click();
  await expect(page.getByRole('button', { name: 'Open linked deal' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to leads' }).click();

  const convertedRow = page.getByRole('link', { name: `Open lead details for ${title}` });
  await convertedRow.getByRole('button', { name: `Actions for ${title}` }).click();
  await expect(page.getByRole('menuitem', { name: 'Convert to Deal' })).toHaveCount(0);
  await page.goto('/#/deals');
  await page.getByRole('tab', { name: 'List' }).click();
  await page.getByLabel('Filter deals by pipeline').selectOption({ label: 'All pipelines' });
  await expect(page.getByText('6 deals', { exact: true })).toBeVisible();
});

test('changing a deal stage in List is reflected in Pipeline', async ({ page }) => {
  await page.goto('/#/deals');
  await page.getByRole('tab', { name: 'List' }).click();
  await page.getByLabel('Filter deals by pipeline').selectOption({ label: 'All pipelines' });
  const title = 'Male Retail Package';
  const row = page.getByRole('link', { name: `Open deal details for ${title}` });
  const stageTrigger = row.getByRole('button', { name: `Change stage for ${title}` });
  await stageTrigger.click();
  await page.getByRole('menu', { name: `Stages for ${title}` })
    .getByRole('menuitem', { name: 'Meetings' }).click();
  await expect(page.getByRole('heading', { name: 'Update deal stage' })).toBeVisible();
  await page.getByRole('button', { name: 'Save stage' }).click();
  await page.getByRole('tab', { name: 'Pipeline' }).click();
  await page.getByLabel('Filter deals by pipeline').selectOption({ label: 'Retail, SME & Velocity Packages' });
  await expect(page.locator('.deals-board > section').filter({ hasText: 'Meetings' })
    .getByRole('button', { name: /Male Retail Package/ })).toBeVisible();
});

test('legacy deal import creates a deal row without exposing linked lead IDs', async ({ page }) => {
  await page.goto('/#/deals');
  await page.getByRole('button', { name: 'Legacy deal' }).click();
  await expect(page.getByRole('heading', { name: 'Import legacy deal' })).toBeVisible();
  await page.getByLabel('Remark *').fill('Imported for browser QA.');
  await page.getByRole('button', { name: 'Create legacy deal' }).click();
  await page.getByRole('tab', { name: 'List' }).click();

  const legacyDeal = page.getByRole('link', { name: 'Open deal details for Legacy import' });
  await expect(legacyDeal).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Linked Lead' })).toHaveCount(0);
  const dealCell = legacyDeal.locator('td[data-label="Title"]');
  await expect(dealCell).toContainText('Legacy import');
  await expect(legacyDeal).not.toContainText(/lead-[a-z0-9-]+/i);
});

test('deal search is shared across views and forecast drag updates expected close', async ({ page }) => {
  await page.goto('/#/deals?view=list');
  await page.getByRole('searchbox', { name: 'Search deals' }).fill('Male Retail Package');
  await expect(page.getByRole('link', { name: 'Open deal details for Male Retail Package' })).toBeVisible();

  await page.getByRole('tab', { name: 'Pipeline' }).click();
  await page.getByLabel('Filter deals by pipeline').selectOption({ label: 'Retail, SME & Velocity Packages' });
  const pipelineCard = page.locator('.deals-board article[data-deal-id]').filter({ hasText: 'Male Retail Package' });
  await expect(pipelineCard).toBeVisible();

  await page.getByRole('tab', { name: 'Forecast' }).click();
  const forecast = page.getByLabel('Deal forecast');
  const card = forecast.locator('article[data-deal-id]').filter({ hasText: 'Male Retail Package' }).first();
  await expect(card).toBeVisible();
  const dealId = await card.getAttribute('data-deal-id');
  const sourcePeriod = await card.evaluate((element) => element.closest<HTMLElement>('section')?.dataset.periodStart);
  const sourceDate = await card.getAttribute('data-expected-close');
  const periodColumns = forecast.locator('.forecast-periods > section');
  const targets = await periodColumns.evaluateAll((elements) => elements.map((element, index) => ({
    index,
    start: (element as HTMLElement).dataset.periodStart,
  })));
  const target = targets.find((period) => period.start !== sourcePeriod && period.start !== sourceDate);
  expect(target).toBeDefined();
  await card.dragTo(periodColumns.nth(target!.index));
  const movedCard = forecast.locator(`article[data-deal-id="${dealId}"]`);
  await expect(movedCard).toHaveAttribute('data-expected-close', target!.start ?? '');
  await movedCard.getByRole('button').click();
  const activityTimeline = page.getByTestId('workspace-activity');
  await expect(activityTimeline.getByText('Expected close changed', { exact: true })).toBeVisible();
  await expect(activityTimeline).toContainText('Demo Administrator');
});

test('Deals list shows the exact stage filter and required table fields', async ({ page }) => {
  await page.goto('/#/deals?view=list');
  expect(await page.locator('thead th').evaluateAll((cells) =>
    cells.map((cell) => cell.textContent?.replace(/[↑↓]/g, '').trim()))).toEqual([
    'Title',
    'Value',
    'Organization',
    'Contact Person',
    'Expected Close Date',
    'Next Activity Date',
    'Owner',
    'Stage',
    'Pipeline',
    'Actions',
  ]);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await expect(page.getByLabel('Stage').locator('option')).toHaveText([
    'All stages',
    'Identified',
    'Contact Made',
    'Key Person Identified',
    'Intro Mail',
    'Meetings',
    'Requirements Identified',
    'Quotation / Underwriting',
    'Quoted / Proposed',
    'Review and Follow up',
  ]);
});

test('Mark lost is a separate deal outcome and requires a reason', async ({ page }) => {
  await page.goto('/#/deals?view=list');
  const title = 'Bonavista Maldives - Contractors All Risks';
  const row = page.getByRole('link', { name: `Open deal details for ${title}` });
  await row.getByRole('button', { name: `Actions for ${title}` }).click();
  await page.getByRole('menuitem', { name: 'Mark lost' }).click();
  await expect(page.getByRole('heading', { name: 'Mark deal lost' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark lost' }).click();
  await expect(page.getByRole('alert')).toHaveText('A loss reason is mandatory.');
  await page.getByLabel('Loss reason (required)').selectOption({ label: 'Incumbent Retained' });
  await page.getByRole('button', { name: 'Mark lost' }).click();
  await page.getByRole('tab', { name: 'Archive' }).click();
  await expect(row).toContainText('Incumbent Retained');
});

test('Mark won is a separate deal outcome and requires a win reason', async ({ page }) => {
  await page.goto('/#/deals?view=list');
  const title = 'Male Retail Package';
  const row = page.getByRole('link', { name: `Open deal details for ${title}` });
  await row.getByRole('button', { name: `Actions for ${title}` }).click();
  await page.getByRole('menuitem', { name: 'Mark won' }).click();
  await expect(page.getByRole('heading', { name: 'Mark deal won' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark won' }).click();
  await expect(page.getByRole('alert')).toHaveText('A win reason is mandatory.');
  await page.getByLabel('Win reason (required)').fill('Client accepted the proposal.');
  await page.getByRole('button', { name: 'Mark won' }).click();
  await page.getByRole('tab', { name: 'Archive' }).click();
  await page.getByLabel('Filter archived deals').selectOption('won');
  await expect(row).toBeVisible();
});

test('archive outcome filter shows only the selected closed-deal state', async ({ page }) => {
  await page.goto('/#/deals?view=archive');
  const archive = page.locator('.deals-archive-fit');
  const outcome = page.getByLabel('Filter archived deals');
  await expect(archive).toBeVisible();
  await outcome.selectOption('won');
  await expect(archive).toContainText('Lagoon Resort Fire Cover');
  await expect(archive).not.toContainText('Coral Construction Machinery Cover');
  await outcome.selectOption('lost');
  await expect(archive).toContainText('Coral Construction Machinery Cover');
  await expect(archive).not.toContainText('Lagoon Resort Fire Cover');
});

test('vendor email validation blocks invalid input and Escape closes the modal', async ({ page }) => {
  await page.goto('/#/vendors');
  await page.getByRole('button', { name: 'Add Vendor' }).click();
  await expect(page.getByRole('heading', { name: 'Add Vendor' })).toBeVisible();
  await page.getByLabel('Vendor name *').fill('QA Invalid Email Vendor');
  await page.getByLabel('Email').fill('invalid-email');
  await page.getByRole('button', { name: 'Create vendor' }).click();
  await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Add Vendor' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Add Vendor' })).toHaveCount(0);
});

test('quotation request form lists open deals only and transitions status in order', async ({ page }) => {
  await page.goto('/#/qslips');
  await page.getByRole('button', { name: 'New QRS' }).click();
  const dealSelector = page.locator('#quotation-request-form select').first();
  await expect(dealSelector.locator('option')).toHaveCount(4);
  await expect(dealSelector).not.toContainText('Policy Renewed');
  await expect(dealSelector).not.toContainText('Lapsed');
  await page.keyboard.press('Escape');

  const status = page.locator('tr').filter({ hasText: 'QR-2026-0001' }).getByRole('combobox', { name: 'Status for QR-2026-0001' });
  await expect(status.locator('option')).toContainText(['Draft', 'Sent', 'Closed']);
  await expect(status.locator('option[value="Responses received"]')).toHaveCount(0);
  await status.selectOption('Sent');
  await expect(status).toHaveValue('Sent');
  await status.selectOption('Responses received');
  await expect(status).toHaveValue('Responses received');
  await status.selectOption('Closed');
  await expect(status).toHaveValue('Closed');
  await expect(status.locator('option').filter({ hasText: 'Reopen to Draft' })).toHaveCount(1);
});

test('linked lead, deal, and vendor deletion is blocked', async ({ page }) => {
  const dialogs: string[] = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.accept();
  });

  await page.goto('/#/leads');
  const leadTitle = 'Bonavista Maldives - Contractors All Risks';
  const leadRow = page.getByRole('link', { name: `Open lead details for ${leadTitle}` });
  await leadRow.getByRole('button', { name: `Actions for ${leadTitle}` }).click();
  await page.getByRole('menuitem', { name: 'Delete lead' }).click();
  await expect.poll(() => dialogs.length).toBe(1);
  expect(dialogs[0]).toMatch(/associated Deal|linked quotation request/);
  await expect(page.getByRole('link', { name: `Open lead details for ${leadTitle}` })).toBeVisible();

  await page.goto('/#/deals');
  await page.getByRole('tab', { name: 'List' }).click();
  await page.getByLabel('Filter deals by pipeline').selectOption({ label: 'All pipelines' });
  const dealTitle = 'Coral Construction Machinery Cover';
  const dealRow = page.getByRole('link', { name: `Open deal details for ${dealTitle}` });
  await dealRow.getByRole('button', { name: `Actions for ${dealTitle}` }).click();
  await page.getByRole('menuitem', { name: 'Delete deal' }).click();
  await expect.poll(() => dialogs.length).toBe(2);
  expect(dialogs[1]).toContain('linked Lead or quotation request');

  await page.goto('/#/vendors');
  const vendorCard = page.locator('.vendor-card-grid > div').filter({ hasText: 'Allied Insurance' });
  await vendorCard.getByRole('button').nth(1).click();
  await expect.poll(() => dialogs.length).toBe(3);
  expect(dialogs[2]).toContain('linked');
  await expect(vendorCard).toBeVisible();
});
