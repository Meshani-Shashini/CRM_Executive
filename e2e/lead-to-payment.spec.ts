import { expect, test } from '@playwright/test';

function dateDisplay(daysFromToday: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date).replaceAll(' ', '-');
}

function dateInputValue(daysFromToday: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

async function navigate(page: import('@playwright/test').Page, label: string) {
  await page.locator('aside').getByRole('link', { name: label, exact: true }).click();
}

test('lead converts through QRS, invoice, and payment with monthly open-to-won reporting', async ({ page }) => {
  const organization = 'Lagoon Marine Logistics';
  const leadTitle = 'Lagoon Marine Hull Insurance';
  const phone = '+960 7771234';
  await page.route('**/rest/v1/rpc/get_next_reference', async (route) => {
    const body = route.request().postDataJSON() as { p_kind?: string; p_year?: number };
    if (body.p_kind !== 'client-quotation' || !body.p_year) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(`QTY-${body.p_year}-0001`),
    });
  });

  await page.goto('/#/leads', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Lead', exact: true }).click();
  await page.locator('input[list="lead-organizations"]').fill(organization);
  await page.locator('input[list="lead-organizations"]').press('Tab');
  await page.getByRole('heading', { name: 'Create New Customer / Organization' }).waitFor();
  await page.locator('#new-organization-form input[name="name"]').fill(organization);
  await page.getByRole('button', { name: 'Create Organization' }).click();

  const leadForm = page.locator('#new-lead-form');
  await leadForm.getByLabel('Primary Contact Name *').fill('Aminath Rasheed');
  await leadForm.getByLabel('Contact Email *').fill('aminath@lagoonmarine.example');
  await leadForm.getByLabel('Contact Phone *').fill(phone);
  await leadForm.getByLabel('WhatsApp').fill(phone);
  await leadForm.getByLabel('Telegram').fill('@lagoonmarine');
  await leadForm.locator('input[name="title"]').fill(leadTitle);
  await leadForm.getByLabel('Type of Insurance Product *').selectOption('HR');
  await leadForm.getByLabel('Deal pipeline').selectOption({ label: 'Commercial Lines Brokerage' });
  await leadForm.getByLabel('Lead Value Currency').selectOption('MVR');
  await leadForm.locator('input[name="value"]').fill('100000');
  await leadForm.getByRole('textbox', { name: 'Expected close date' }).fill(dateDisplay(30));
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const leadRow = page.getByRole('link', { name: `Open lead details for ${leadTitle}` });
  await expect(leadRow).toBeVisible();

  await navigate(page, 'Clients');
  await page.getByRole('row').filter({ hasText: organization }).click();
  await page.getByRole('button', { name: 'Edit Client' }).click();
  const clientForm = page.locator('#edit-client-form');
  await clientForm.locator('input[name="tin"]').fill('TIN-ML-20481');
  await clientForm.locator('input[name="phone"]').fill(phone);
  await clientForm.locator('input[name="email"]').fill('aminath@lagoonmarine.example');
  await clientForm.locator('input[name="contactPerson"]').fill('Aminath Rasheed');
  await clientForm.locator('textarea[name="address"]').fill('Hulhumale, Maldives');
  await clientForm.locator('input[name="country"]').fill('Maldives');
  //await clientForm.locator('input[name="class"]').fill('Marine Hull');
 //await clientForm.locator('input[name="productCode"]').fill('HR');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await page.getByRole('dialog', { name: organization })
    .getByRole('button', { name: 'Close client details' }).click();

  await navigate(page, 'Leads');
  const leadDetailsRow = page.getByRole('link', { name: `Open lead details for ${leadTitle}` });
  await leadDetailsRow.focus();
  await page.keyboard.press('Enter');
  const leadWorkspace = page.getByTestId('workspace-activity');
  await leadWorkspace.getByRole('button', { name: 'Schedule next activity' }).click();
  await page.locator('#workspace-activity-form input[name="title"]').fill('Confirm vessel schedule');
  await page.getByRole('button', { name: 'Schedule activity' }).click();

  const leadStages = ['Contact Made', 'Key Person Identified', 'Intro Email Sent', 'Meetings Ongoing'];
  for (const stage of leadStages) {
    await page.getByRole('region', { name: 'Lead telemetry stage tracker' })
      .getByRole('button', { name: new RegExp(`^${stage}`) }).click();
    await expect(page.getByRole('heading', { name: 'Lead telemetry' })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Back to leads' }).click();
  await page.getByRole('tab', { name: 'Kanban view' }).click();
  const sourceCard = page.locator('article').filter({ hasText: leadTitle });
  const convertedStage = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Converted to deal', exact: true }),
  }).first();
  await sourceCard.dragTo(convertedStage);
  await expect(page.getByTestId('activity-summary')).toContainText('Meetings Ongoing');
  await expect(page.getByTestId('deal-stage-stepper')).toHaveCount(0);

  await page.getByRole('group', { name: 'Lead list navigation' })
    .getByRole('button', { name: 'List view' }).click();
  await expect(page.getByRole('tab', { name: 'List view' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Deals pipeline', { exact: true })).toHaveCount(0);
  const convertedLeadRow = page.getByRole('link', { name: `Open lead details for ${leadTitle}` });
  await convertedLeadRow.getByRole('button', { name: `Actions for ${leadTitle}` }).click();
  await page.getByRole('menuitem', { name: 'Convert to Deal' }).click();
  await expect(convertedLeadRow).toHaveCount(0);

  await navigate(page, 'Deals');
  await expect(page.getByRole('link', { name: `Open deal details for ${leadTitle}` })).toHaveCount(1);
  const dealDetailsRow = page.getByRole('link', { name: `Open deal details for ${leadTitle}` });
  await dealDetailsRow.focus();
  await page.keyboard.press('Enter');
  const dealWorkspace = page.getByTestId('workspace-activity');
  await dealWorkspace.getByRole('button', { name: 'Schedule next activity' }).click();
  await page.locator('#workspace-activity-form input[name="title"]').fill('Submit underwriting pack');
  await page.getByRole('button', { name: 'Schedule activity' }).click();
  await expect(page.getByRole('heading', { name: 'Schedule next activity' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Create QRS', exact: true }).first().click();
  await expect(page).toHaveURL(/#\/qslips/);
  await expect(page.getByRole('heading', { name: 'New Quotation Request Slip' })).toBeVisible();

  const qrsForm = page.locator('#quotation-request-form');
  await expect(qrsForm.getByText(organization, { exact: true })).toBeVisible();
  await expect(qrsForm.getByText(leadTitle, { exact: true })).toBeVisible();
  const requiredBy = page.locator('input[type="text"][aria-label="Required by date"]');
  await expect(requiredBy).toHaveAttribute('required', '');
  expect(await requiredBy.evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(false);
  await requiredBy.fill(dateDisplay(14));
  await page.getByRole('button', { name: 'Continue' }).click();

  await qrsForm.getByLabel('Product section *').selectOption('PR');
  await qrsForm.getByRole('button', { name: 'Add section' }).click();
  await qrsForm.getByLabel('Sum insured').first().fill('300000');
  await qrsForm.getByLabel('Product section *').selectOption('LP');
  await qrsForm.getByRole('button', { name: 'Add section' }).click();
  await qrsForm.getByLabel('Gross profit').fill('120000');
  await page.getByRole('button', { name: 'Continue' }).click();

  const sectionInsurers = qrsForm.locator('fieldset');
  await expect(sectionInsurers).toHaveCount(2);
  const firstSectionInsurers = sectionInsurers.nth(0).locator('input[type="checkbox"]');
  const secondSectionInsurers = sectionInsurers.nth(1).locator('input[type="checkbox"]');
  await expect(firstSectionInsurers).toHaveCount(3);
  await firstSectionInsurers.nth(0).check();
  await firstSectionInsurers.nth(1).check();
  await secondSectionInsurers.nth(0).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Create slips' }).click();
  const batchRow = page.getByRole('link', { name: /Open QRS details/ }).first();
  await expect(batchRow).toBeVisible();
  const batchReference = (await batchRow.getAttribute('aria-label'))?.match(/QRS-\d{3,}-\d{4}/)?.[0];
  expect(batchReference).toBeTruthy();
  const lineRows = page.getByRole('row').filter({ hasText: new RegExp(`${batchReference}-01-0[12]`) });
  await expect(lineRows).toHaveCount(2);
  const firstLineReference = (await lineRows.nth(0).innerText()).match(/QRS-\d{3,}-\d{4}-\d{2}-\d{2}/)?.[0];
  const secondLineReference = (await lineRows.nth(1).innerText()).match(/QRS-\d{3,}-\d{4}-\d{2}-\d{2}/)?.[0];
  expect(firstLineReference).toBeTruthy();
  expect(secondLineReference).toBeTruthy();
  expect(firstLineReference).not.toBe(secondLineReference);
  await expect(page.getByRole('row').filter({ hasText: new RegExp(`${batchReference}-02-01`) })).toHaveCount(1);

  await page.getByRole('button', { name: `Update ${firstLineReference}` }).click();
  await page.getByLabel('Status *').selectOption('Quoted');
  await page.getByLabel('Premium *').fill('2400');
  await page.getByRole('button', { name: 'Save line' }).click();

  await page.getByRole('button', { name: `Update ${secondLineReference}` }).click();
  await page.getByLabel('Status *').selectOption('Declined');
  await page.getByLabel('Decline reason *').fill('Insurer declined the vessel risk.');
  await page.getByRole('button', { name: 'Save line' }).click();
  await expect(batchRow).toContainText('Partially Quoted');

  await navigate(page, 'Deals');
  const qrsDealRow = page.getByRole('link', { name: `Open deal details for ${leadTitle}` });
  await qrsDealRow.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Manage QRS' }).last().click();
  await expect(page).toHaveURL(/#\/qslips\?request=.*&deal=.*&dealView=/);
  await expect(page.getByRole('link', { name: 'Back to deal' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'New Quotation Request Slip' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Back to deal' }).click();
  await expect(page).toHaveURL(/#\/deals\?deal=.*&view=/);
  await expect(page.getByRole('heading', { name: 'Quotation comparison' })).toBeVisible();
  await page.goto('/#/qslips');
  const listedBatchRow = page.getByRole('link', { name: `Open QRS details ${batchReference}` });
  await expect(listedBatchRow).toBeVisible();
  await listedBatchRow.click();
  await expect(page).toHaveURL(/#\/qslips\?request=.*&deal=.*&source=list/);
  await expect(page.getByRole('tab', { name: 'Formal slip' })).toBeVisible();
  const detailLine = page.getByRole('row').filter({ hasText: secondLineReference! });
  await detailLine.getByRole('button', { name: 'Log carrier quotation' }).click();
  await page.getByLabel('Status *').selectOption('Quoted');
  await page.getByLabel('Premium *').fill('1200');
  await page.getByLabel('Valid until *').fill(dateInputValue(30));
  await page.getByRole('button', { name: 'Save line' }).click();
  await expect(page.getByRole('row').filter({ hasText: secondLineReference! })).toContainText('Best');
  await page.getByRole('tab', { name: 'Formal slip' }).click();
  await page.getByLabel('Print slip for insurer').selectOption({ index: 2 });
  await expect(page.locator('article.qrs-formal-slip > section.rounded-lg')).toHaveCount(1);

  await navigate(page, 'Deals');
  const updatedDealLink = page.getByRole('link', { name: `Open deal details for ${leadTitle}` });
  await updatedDealLink.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Quotation comparison' })).toBeVisible();
  const liveComparisonRow = page.getByRole('row').filter({ hasText: secondLineReference! });
  await expect(liveComparisonRow).toContainText('Quoted');
  await expect(liveComparisonRow).toContainText('MVR 1,200.00');
  await page.getByRole('link', { name: 'Create client quotation' }).click();
  await expect(page).toHaveURL(/#\/quotations\?/);
  await expect(page.getByRole('heading', { name: 'Create client quotation' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Addressee').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Save as Draft' }).click();
  await expect(page.getByRole('heading', { name: /QTY-\d{4}-\d{4}/ })).toBeVisible();
  await page.getByRole('button', { name: 'Issue quotation' }).click();
  await expect(page.getByRole('status')).toContainText('issued');
  const acceptanceName = page.getByRole('textbox', { name: 'Name *', exact: true });
  await acceptanceName.fill('Aminath Rasheed');
  await expect(acceptanceName).toHaveValue('Aminath Rasheed');
  await page.getByLabel('Designation').last().fill('Fleet Manager');
  await page.getByRole('button', { name: 'Record acceptance' }).click();
  await expect(page.getByRole('status')).toContainText('accepted');

  await navigate(page, 'Dashboard');
  const monthlySummary = page.getByRole('region', { name: 'Monthly company deal summary' });
  await monthlySummary.getByRole('button', { name: 'open', exact: true }).click();
  await expect(monthlySummary).toContainText('Quoted / Proposed · 1');
  await expect(monthlySummary).toContainText('Open · total value');

  await navigate(page, 'Deals');
  const dealRow = page.getByRole('link', { name: `Open deal details for ${leadTitle}` });
  await dealRow.getByRole('button', { name: `Actions for ${leadTitle}` }).click();
  await page.getByRole('menuitem', { name: 'Mark won' }).click();
  await page.getByLabel('Win reason (required)').fill('The client accepted the marine hull placement terms.');
  await page.getByRole('button', { name: 'Mark won', exact: true }).click();

  await navigate(page, 'Dashboard');
  const wonSummary = page.getByRole('region', { name: 'Monthly company deal summary' });
  await wonSummary.getByRole('button', { name: 'won', exact: true }).click();
  await expect(wonSummary).toContainText('Won · closed value');
  await expect(wonSummary).toContainText('1 deal');

  await navigate(page, 'Invoice');
  const invoiceRow = page.getByRole('row').filter({ hasText: organization });
  await expect(invoiceRow).toBeVisible();
  await expect(invoiceRow).toContainText('Pending');

  await navigate(page, 'Payments');
  await page.getByRole('button', { name: 'Record Payment' }).click();
  await page.locator('#record-payment-form select[name="invoiceId"]').selectOption({ index: 0 });
  await page.locator('#record-payment-form input[name="amount"]').fill('1200');
  await page.locator('button[form="record-payment-form"]').click();
  await expect(page.getByRole('row').filter({ hasText: organization })).toBeVisible();

  await navigate(page, 'Invoice');
  const paidInvoice = page.getByRole('row').filter({ hasText: organization });
  await expect(paidInvoice).toContainText('Paid');
});
