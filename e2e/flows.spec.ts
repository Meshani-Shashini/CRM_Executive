import { expect, test } from '@playwright/test';

test('lead conversion creates one linked deal and blocks a second conversion', async ({ page }) => {
  await page.goto('/#/leads');
  const title = 'North Harbour Cargo Cover';
  const row = page.getByRole('link', { name: `Open lead details for ${title}` });
  await row.getByRole('button', { name: `Actions for ${title}` }).click();
  await page.getByRole('menuitem', { name: 'Convert to Deal' }).click();
  await expect(page.getByRole('link', { name: `Open lead details for ${title}` })).toBeVisible();

  const convertedRow = page.getByRole('link', { name: `Open lead details for ${title}` });
  await convertedRow.getByRole('button', { name: `Actions for ${title}` }).click();
  await expect(page.getByRole('menuitem', { name: 'Convert to Deal' })).toHaveCount(0);
  await page.goto('/#/deals');
  await expect(page.getByText('6 deals', { exact: true })).toBeVisible();
});

test('changing a deal stage in List is reflected in Kanban', async ({ page }) => {
  await page.goto('/#/deals');
  const title = 'Male Retail Package';
  const row = page.getByRole('link', { name: `Open deal details for ${title}` });
  const stageSelector = row.getByRole('combobox', { name: `Change stage for ${title}` });
  await stageSelector.selectOption({ label: 'Client Confirmation' });
  await expect(page.getByRole('heading', { name: 'Update deal stage' })).toBeVisible();
  await page.getByRole('button', { name: 'Save stage' }).click();
  await page.getByRole('tab', { name: 'Kanban' }).click();
  await page.getByLabel('Select deal pipeline').selectOption({ label: 'Retail, SME & Velocity Packages' });
  await expect(page.locator('.deals-board > section').filter({ hasText: 'Client Confirmation' }))
    .toContainText(title);
});

test('legacy deal import creates and displays a linked lead', async ({ page }) => {
  await page.goto('/#/deals');
  await page.getByRole('button', { name: '+ Legacy deal' }).click();
  await expect(page.getByRole('heading', { name: 'Import legacy deal' })).toBeVisible();
  await page.getByLabel('Remark *').fill('Imported for browser QA.');
  await page.getByRole('button', { name: 'Create legacy deal' }).click();

  const legacyDeal = page.getByRole('link', { name: 'Open deal details for Legacy import' });
  await expect(legacyDeal).toBeVisible();
  await expect(legacyDeal).toContainText('lead-');
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
  expect(dialogs[0]).toContain('associated Deal');
  await expect(page.getByRole('link', { name: `Open lead details for ${leadTitle}` })).toBeVisible();

  await page.goto('/#/deals');
  const dealRow = page.getByRole('link', { name: 'Open deal details for Bonavista Maldives - Contractors All Risks' });
  await dealRow.getByRole('button', { name: 'Actions for Bonavista Maldives - Contractors All Risks' }).click();
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
