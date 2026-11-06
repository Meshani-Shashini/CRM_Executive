# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: flows.spec.ts >> lead conversion creates one linked deal and blocks a second conversion
- Location: e2e\flows.spec.ts:3:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('link', { name: 'Open lead details for North Harbour Cargo Cover' })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('link', { name: 'Open lead details for North Harbour Cargo Cover' }) with timeout 10000ms
  - waiting for getByRole('link', { name: 'Open lead details for North Harbour Cargo Cover' })

```

```yaml
- complementary:
  - text: DA Demo Administrator System admin
  - navigation:
    - img
    - text: Broker Portal
    - link "Dashboard":
      - /url: "#/dashboard"
      - img
      - text: Dashboard
    - link "My Plan":
      - /url: "#/plans"
      - img
      - text: My Plan
    - link "Leads":
      - /url: "#/leads"
      - img
      - text: Leads
      - img
    - link "Deals":
      - /url: "#/deals"
      - img
      - text: Deals
    - link "Clients":
      - /url: "#/clients"
      - img
      - text: Clients
    - link "Vendors":
      - /url: "#/vendors"
      - img
      - text: Vendors
    - link "Calendar":
      - /url: "#/calendar"
      - img
      - text: Calendar
    - link "Reports":
      - /url: "#/reports"
      - img
      - text: Reports
    - link "Documents":
      - /url: "#/documents"
      - img
      - text: Documents
    - img
    - text: Policy Portal
    - link "Quotation Slips":
      - /url: "#/qslips"
      - img
      - text: Quotation Slips
    - link "Quotations":
      - /url: "#/quotations"
      - img
      - text: Quotations
    - link "Internal Slips":
      - /url: "#/internal-slips"
      - img
      - text: Internal Slips
    - link "Invoice":
      - /url: "#/invoices"
      - img
      - text: Invoice
    - link "Payments":
      - /url: "#/payments"
      - img
      - text: Payments
    - link "Payment Requests":
      - /url: "#/pay-requests"
      - img
      - text: Payment Requests
    - link "Renewals":
      - /url: "#/renewals"
      - img
      - text: Renewals
    - link "Info Requests":
      - /url: "#/info-requests"
      - img
      - text: Info Requests
    - link "Rate Cards":
      - /url: "#/rate-cards"
      - img
      - text: Rate Cards
    - img
    - text: Admin Portal
    - img
    - text: Restricted
    - link "Settings":
      - /url: "#/settings"
      - img
      - text: Settings
    - link "Funnels":
      - /url: "#/funnels"
      - img
      - text: Funnels
    - link "Pipelines":
      - /url: "#/pipelines"
      - img
      - text: Pipelines
  - group "Preview role":
    - button "Admin" [pressed]
    - button "Sales"
    - button "Finance"
    - button "Client"
  - button "Sign out":
    - img
    - text: Sign out
- banner:
  - heading "Leads" [level=1]
  - img
  - combobox "Search clients, leads, invoices…"
  - text: ⌘K
  - button "Notifications, 2 unread":
    - img
    - text: "2"
  - button "Account menu for Demo Administrator":
    - text: DA Demo Administrator Development Demo Session
    - img
- main:
  - heading "All Leads" [level=2]
  - main:
    - img
    - heading "Lagoon Resorts" [level=1]
    - text: Lead Converted to deal
    - button "Change North Harbour Cargo Cover temperature": COLD
    - text: DA Dwelling Fire · Annual Policy Renewals · Ref demo-lead-6
    - button "Open linked deal"
    - tablist "Deal workspace views":
      - tab "Kanban view":
        - img
      - tab "Inspection view" [selected]:
        - img
    - button "Back to leads":
      - img
    - button "Edit lead":
      - img
    - button "Delete lead":
      - img
    - region "Lead telemetry stage tracker":
      - heading "Lead telemetry" [level=2]
      - list:
        - listitem:
          - button "Lead Identified; entered 12-Oct-2026; completed" [disabled]: Lead Identified
        - listitem:
          - button "Contact Made; completed" [disabled]: Contact Made
        - listitem:
          - button "Key Person Identified; completed" [disabled]: Key Person Identified
        - listitem:
          - button "Intro Email Sent; completed" [disabled]: Intro Email Sent
        - listitem:
          - button "Meetings Ongoing; entered 12-Oct-2026; stage duration 25d; completed" [disabled]: Meetings Ongoing
        - listitem:
          - button "Converted; entered 06-Nov-2026; completed" [disabled]: Converted
      - list "Lead stage dates and durations":
        - listitem: 12-Oct-2026
        - listitem
        - listitem
        - listitem
        - listitem: 12-Oct-2026 +25d
        - listitem: 06-Nov-2026 25d
    - region "Lead 360":
      - heading "Lead 360 · Lead → Deal → Quotation Requests" [level=2]
      - text: Lead
      - button "North Harbour Cargo Cover"
      - text: Deal
      - button "Lagoon Resorts · Dwelling Fire"
      - text: Quotation Requests No quotation requests
    - heading "Client Details" [level=2]
    - text: Name Lagoon Resorts Identification TIN-DEMO-3 Address Demo address 3, Male Country Singapore Email client3@example.test Phone +960 7770031
    - heading "Lead Details" [level=3]
    - text: Lead Owner Demo Administrator Lead Stage Converted to deal Contacted At Awaiting first contact Expected Closing Date 26-Dec-2026 Remarks / Notes Seeded only for local UI verification.
    - heading "Policy Details" [level=2]
    - text: Probability Percentage 30% Insurance Type Dwelling Fire Current Insurer Allied Insurance Sum Insured USD 400,000.00 Premium Value USD 20,000.00 Expiry / Renewal Date 11-Mar-2027
    - region "Customer contacts":
      - heading "Contacts 1" [level=3]
      - term: Name
      - term: Email
      - term: Phone
      - term: WhatsApp
      - term: Telegram
      - term: Edit
      - article:
        - text: Contact 3 Decision Maker Primary client3@example.test +960 7770031 +960 7770031 @demoContact3
        - button "Edit Contact 3":
          - img
    - heading "Activity" [level=2]:
      - img
      - text: Activity
    - paragraph: Stage movement and client touchpoints.
    - button "Appointment":
      - img
      - text: Appointment
    - button "Proposal":
      - img
      - text: Proposal
    - button "Note":
      - img
      - text: Note
    - button "Task":
      - img
      - text: Task
    - group "Filter timeline entries":
      - button "All" [pressed]
      - button "Stage changes"
      - button "Temperature"
      - button "Activity"
      - button "Appointments"
      - button "Proposals"
      - button "Notes"
      - button "Tasks"
    - region "Activity timeline":
      - article:
        - time: 12-Oct-2026 23:30
        - text: Lead created North Harbour Cargo Cover
      - article:
        - time: 06-Nov-2026 23:31
        - text: Lead last modified Latest recorded lead update
      - article:
        - time: 06-Nov-2026 23:31
        - text: "Deal created Record: — → Dwelling Fire · Deal stage: — → Renewal Audit & Loss Review (T-90d) · By Demo Administrator"
    - heading "Lead progression" [level=2]
    - paragraph: This lead is linked to deal deal-52499c86-6575-4a9d-91f1-140a8e70e9ea and follows its placement stages.
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
> 9   |   await expect(page.getByRole('link', { name: `Open lead details for ${title}` })).toBeVisible();
      |                                                                                    ^ Error: expect(locator).toBeVisible() failed
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
  29  |     .toContainText(title);
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