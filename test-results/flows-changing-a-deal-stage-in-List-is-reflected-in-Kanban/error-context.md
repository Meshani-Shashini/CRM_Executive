# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: flows.spec.ts >> changing a deal stage in List is reflected in Kanban
- Location: e2e\flows.spec.ts:18:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('.deals-board > section').filter({ hasText: 'Client Confirmation' })
Expected substring: "Male Retail Package"
Received string:    "Client Confirmation1Lagoon ResortsDwelling Fire · Island ReinsuranceMVR 90,000.00"
Timeout: 10000ms

Call log:
  - Expect "toContainText" locator('.deals-board > section').filter({ hasText: 'Client Confirmation' }) with timeout 10000ms
  - waiting for locator('.deals-board > section').filter({ hasText: 'Client Confirmation' })
    23 × locator resolved to <section class="min-w-0 rounded-xl border border-ink-700 bg-ink-900/55 p-2.5">…</section>
       - unexpected value "Client Confirmation1Lagoon ResortsDwelling Fire · Island ReinsuranceMVR 90,000.00"

```

```yaml
- heading "Client Confirmation" [level=3]
- text: "1"
- button "Lagoon Resorts Dwelling Fire · Island Reinsurance MVR 90,000.00"
```

# Test source

```ts
  1   | import { expect, test } from '@playwright/test';
  2   | 
  3   | test('lead conversion creates one linked deal and blocks a second conversion', async ({ page }) => {
  4   |   await page.goto('/#/leads');
  5   |   const title = 'North Harbour Cargo Cover';
  6   |   const row = page.getByRole('link', { name: `Open lead details for ${title}` });
  7   |   await row.getByRole('button', { name: `Actions for ${title}` }).click();
  8   |   await page.getByRole('menuitem', { name: 'Convert to Deal' }).click();
  9   |   await expect(page.getByRole('link', { name: `Open lead details for ${title}` })).toBeVisible();
  10  | 
  11  |   const convertedRow = page.getByRole('link', { name: `Open lead details for ${title}` });
  12  |   await convertedRow.getByRole('button', { name: `Actions for ${title}` }).click();
  13  |   await expect(page.getByRole('menuitem', { name: 'Convert to Deal' })).toHaveCount(0);
  14  |   await page.goto('/#/deals');
  15  |   await expect(page.getByText('6 deals', { exact: true })).toBeVisible();
  16  | });
  17  | 
  18  | test('changing a deal stage in List is reflected in Kanban', async ({ page }) => {
  19  |   await page.goto('/#/deals');
  20  |   const title = 'Male Retail Package';
  21  |   const row = page.getByRole('link', { name: `Open deal details for ${title}` });
  22  |   const stageSelector = row.getByRole('combobox', { name: `Change stage for ${title}` });
  23  |   await stageSelector.selectOption({ label: 'Client Confirmation' });
  24  |   await expect(page.getByRole('heading', { name: 'Update deal stage' })).toBeVisible();
  25  |   await page.getByRole('button', { name: 'Save stage' }).click();
  26  |   await page.getByRole('tab', { name: 'Kanban' }).click();
  27  |   await page.getByLabel('Select deal pipeline').selectOption({ label: 'Retail, SME & Velocity Packages' });
  28  |   await expect(page.locator('.deals-board > section').filter({ hasText: 'Client Confirmation' }))
> 29  |     .toContainText(title);
      |      ^ Error: expect(locator).toContainText(expected) failed
  30  | });
  31  | 
  32  | test('legacy deal import creates and displays a linked lead', async ({ page }) => {
  33  |   await page.goto('/#/deals');
  34  |   await page.getByRole('button', { name: '+ Legacy deal' }).click();
  35  |   await expect(page.getByRole('heading', { name: 'Import legacy deal' })).toBeVisible();
  36  |   await page.getByLabel('Remark *').fill('Imported for browser QA.');
  37  |   await page.getByRole('button', { name: 'Create legacy deal' }).click();
  38  | 
  39  |   const legacyDeal = page.getByRole('link', { name: 'Open deal details for Legacy import' });
  40  |   await expect(legacyDeal).toBeVisible();
  41  |   await expect(legacyDeal).toContainText('lead-');
  42  | });
  43  | 
  44  | test('vendor email validation blocks invalid input and Escape closes the modal', async ({ page }) => {
  45  |   await page.goto('/#/vendors');
  46  |   await page.getByRole('button', { name: 'Add Vendor' }).click();
  47  |   await expect(page.getByRole('heading', { name: 'Add Vendor' })).toBeVisible();
  48  |   await page.getByLabel('Vendor name *').fill('QA Invalid Email Vendor');
  49  |   await page.getByLabel('Email').fill('invalid-email');
  50  |   await page.getByRole('button', { name: 'Create vendor' }).click();
  51  |   await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  52  |   await expect(page.getByRole('heading', { name: 'Add Vendor' })).toBeVisible();
  53  |   await page.keyboard.press('Escape');
  54  |   await expect(page.getByRole('heading', { name: 'Add Vendor' })).toHaveCount(0);
  55  | });
  56  | 
  57  | test('quotation request form lists open deals only and transitions status in order', async ({ page }) => {
  58  |   await page.goto('/#/qslips');
  59  |   await page.getByRole('button', { name: 'New QRS' }).click();
  60  |   const dealSelector = page.locator('#quotation-request-form select').first();
  61  |   await expect(dealSelector.locator('option')).toHaveCount(4);
  62  |   await expect(dealSelector).not.toContainText('Policy Renewed');
  63  |   await expect(dealSelector).not.toContainText('Lapsed');
  64  |   await page.keyboard.press('Escape');
  65  | 
  66  |   const status = page.locator('tr').filter({ hasText: 'QR-2026-0001' }).getByRole('combobox', { name: 'Status for QR-2026-0001' });
  67  |   await expect(status.locator('option')).toContainText(['Draft', 'Sent', 'Closed']);
  68  |   await expect(status.locator('option[value="Responses received"]')).toHaveCount(0);
  69  |   await status.selectOption('Sent');
  70  |   await expect(status).toHaveValue('Sent');
  71  |   await status.selectOption('Responses received');
  72  |   await expect(status).toHaveValue('Responses received');
  73  |   await status.selectOption('Closed');
  74  |   await expect(status).toHaveValue('Closed');
  75  |   await expect(status.locator('option').filter({ hasText: 'Reopen to Draft' })).toHaveCount(1);
  76  | });
  77  | 
  78  | test('linked lead, deal, and vendor deletion is blocked', async ({ page }) => {
  79  |   const dialogs: string[] = [];
  80  |   page.on('dialog', async (dialog) => {
  81  |     dialogs.push(dialog.message());
  82  |     await dialog.accept();
  83  |   });
  84  | 
  85  |   await page.goto('/#/leads');
  86  |   const leadTitle = 'Bonavista Maldives - Contractors All Risks';
  87  |   const leadRow = page.getByRole('link', { name: `Open lead details for ${leadTitle}` });
  88  |   await leadRow.getByRole('button', { name: `Actions for ${leadTitle}` }).click();
  89  |   await page.getByRole('menuitem', { name: 'Delete lead' }).click();
  90  |   await expect.poll(() => dialogs.length).toBe(1);
  91  |   expect(dialogs[0]).toContain('associated Deal');
  92  |   await expect(page.getByRole('link', { name: `Open lead details for ${leadTitle}` })).toBeVisible();
  93  | 
  94  |   await page.goto('/#/deals');
  95  |   const dealRow = page.getByRole('link', { name: 'Open deal details for Bonavista Maldives - Contractors All Risks' });
  96  |   await dealRow.getByRole('button', { name: 'Actions for Bonavista Maldives - Contractors All Risks' }).click();
  97  |   await page.getByRole('menuitem', { name: 'Delete deal' }).click();
  98  |   await expect.poll(() => dialogs.length).toBe(2);
  99  |   expect(dialogs[1]).toContain('linked Lead or quotation request');
  100 | 
  101 |   await page.goto('/#/vendors');
  102 |   const vendorCard = page.locator('.vendor-card-grid > div').filter({ hasText: 'Allied Insurance' });
  103 |   await vendorCard.getByRole('button').nth(1).click();
  104 |   await expect.poll(() => dialogs.length).toBe(3);
  105 |   expect(dialogs[2]).toContain('linked');
  106 |   await expect(vendorCard).toBeVisible();
  107 | });
  108 | 
```