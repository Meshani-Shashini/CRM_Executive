import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const viewports = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 820, height: 1180 },
  { width: 1024, height: 768 },
  { width: 1180, height: 820 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
];

const screenshotsDirectory = path.resolve('e2e/screenshots');

async function assertNoHorizontalOverflow(page: Page) {
  const measurements = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    containers: [...document.querySelectorAll<HTMLElement>('.fit-wrap, .deals-fit')]
      .map((element) => ({ className: element.className, scroll: element.scrollWidth, client: element.clientWidth })),
  }));
  expect(measurements.document, `document overflow: ${JSON.stringify(measurements)}`).toBe(measurements.viewport);
  expect(
    measurements.containers.filter((element) => element.scroll > element.client),
    `container overflow: ${JSON.stringify(measurements.containers)}`,
  ).toEqual([]);
}

async function assertTableFields(page: Page) {
  for (const table of await page.locator('.fit-wrap table').all()) {
    const headerCount = await table.locator('thead th').count();
    for (const row of await table.locator('tbody tr').all()) {
      const labels = await row.locator('td[data-label]').evaluateAll((cells) =>
        cells.map((cell) => (cell as HTMLElement).dataset.label ?? ''),
      );
      if (labels.length === 0) continue;
      expect(labels, 'each data row must expose all table fields').toHaveLength(headerCount);
      for (const cell of await row.locator('td[data-label]').all()) {
        await expect(cell).toBeVisible();
      }
    }
  }
}

async function takeViewportScreenshot(page: Page, name: string) {
  await page.screenshot({
    path: path.join(screenshotsDirectory, `${name}.png`),
    fullPage: true,
    animations: 'disabled',
  });
}

test.beforeAll(() => {
  mkdirSync(screenshotsDirectory, { recursive: true });
});

for (const viewport of viewports) {
  const sizeLabel = `${viewport.width}x${viewport.height}`;
  test(`responsive pages and screenshots at ${sizeLabel}`, async ({ page }) => {
    await page.setViewportSize(viewport);

    await page.goto('/#/leads');
    await expect(page.getByRole('table', { name: 'Leads' })).toBeVisible();
    await expect(page.getByText('Bonavista Maldives - Contractors All Risks', { exact: true }).first()).toBeVisible();
    await assertTableFields(page);
    await assertNoHorizontalOverflow(page);
    await takeViewportScreenshot(page, `leads-${sizeLabel}`);

    await page.goto('/#/deals');
    const tabs = page.getByRole('tablist', { name: 'Deal workspace views' }).getByRole('tab');
    await expect(tabs).toHaveText(['List', 'Kanban', 'Inspection']);
    await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
    await assertTableFields(page);
    await assertNoHorizontalOverflow(page);
    await takeViewportScreenshot(page, `deals-list-${sizeLabel}`);

    const firstDeal = page.getByRole('link', { name: /^Open deal details for/ }).first();
    const stageSelect = firstDeal.getByRole('combobox', { name: /^Change stage for/ });
    const stageTypography = await stageSelect.evaluate((select) => {
      const stageCell = select.closest('td');
      return {
        select: getComputedStyle(select).fontSize,
        neighboringCell: getComputedStyle(stageCell?.previousElementSibling ?? select).fontSize,
        title: select.getAttribute('title'),
        selectedStage: select.selectedOptions[0]?.textContent,
      };
    });
    expect(stageTypography.select).toBe(stageTypography.neighboringCell);
    expect(stageTypography.title).toBe(stageTypography.selectedStage);

    const dealActionsButton = firstDeal.getByRole('button', { name: /^Actions for/ });
    await dealActionsButton.click();
    const dealActionsMenu = page.getByRole('menu', { name: /^Deal actions for/ });
    const deleteDealItem = dealActionsMenu.getByRole('menuitem', { name: 'Delete deal' });
    await expect(deleteDealItem).toBeVisible();
    await expect(deleteDealItem).toHaveCSS('white-space', 'nowrap');
    await expect(deleteDealItem).toHaveCSS('overflow-wrap', 'normal');
    await expect(deleteDealItem).toHaveCSS('word-break', 'normal');
    const menuBounds = await dealActionsMenu.evaluate((menu) => {
      const bounds = menu.getBoundingClientRect();
      return {
        top: bounds.top,
        left: bounds.left,
        right: bounds.right,
        bottom: bounds.bottom,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        isPortaled: menu.parentElement === document.body,
      };
    });
    expect(menuBounds.isPortaled).toBe(true);
    expect(menuBounds.left).toBeGreaterThanOrEqual(0);
    expect(menuBounds.top).toBeGreaterThanOrEqual(0);
    expect(menuBounds.right).toBeLessThanOrEqual(menuBounds.viewportWidth);
    expect(menuBounds.bottom).toBeLessThanOrEqual(menuBounds.viewportHeight);
    await assertNoHorizontalOverflow(page);
    await dealActionsButton.click();

    await tabs.nth(1).click();
    const pipelineSelect = page.getByLabel('Select deal pipeline');
    await pipelineSelect.selectOption({ label: 'Commercial Lines Brokerage' });
    const board = page.locator('.deals-fit');
    const boardWidth = await board.evaluate((element) => element.clientWidth);
    const expectedColumns = boardWidth < 640 ? 1 : boardWidth < 1000 ? 3 : 6;
    await expect(page.locator('.deals-board > section')).toHaveCount(6);
    await expect.poll(() => page.locator('.deals-board').evaluate((element) =>
      getComputedStyle(element).gridTemplateColumns.split(' ').length,
    )).toBe(expectedColumns);
    for (const stage of [
      'Fact-Finding & Risk Survey',
      'Market Tender & Placing Slip Submission',
      'Comparative Analysis & Presentation',
      'Underwriter Negotiation & Structuring',
      'Policy Bound / Won',
      'Lost / Market Declined',
    ]) await expect(page.locator('.deals-board')).toContainText(stage);
    await assertNoHorizontalOverflow(page);
    await takeViewportScreenshot(page, `deals-kanban-${sizeLabel}`);

    await tabs.nth(2).click();
    await expect(page.locator('main')).toContainText('placement workspace');
    await assertNoHorizontalOverflow(page);
    await takeViewportScreenshot(page, `deals-inspection-${sizeLabel}`);

    await page.goto('/#/vendors');
    await expect(page.getByRole('heading', { name: 'Vendors' })).toBeVisible();
    const vendors = page.locator('.vendor-card-grid > div');
    await expect(vendors).toHaveCount(4);
    for (const vendor of [
      ['Allied Insurance', 'Maldives', 'MVR', 'allied@example.test'],
      ['Dhivehi Insurance', 'Sri Lanka', 'USD', 'dhivehi@example.test'],
      ['Island Reinsurance', 'Singapore', 'USD', 'island-re@example.test'],
      ['Inactive Carrier', 'United Arab Emirates', 'USD', 'inactive@example.test'],
    ]) {
      const card = vendors.filter({ hasText: vendor[0] });
      await expect(card).toContainText(vendor[1]);
      await expect(card).toContainText(vendor[2]);
      await expect(card).toContainText(vendor[3]);
    }
    await assertNoHorizontalOverflow(page);
    await takeViewportScreenshot(page, `vendors-${sizeLabel}`);

    await page.goto('/#/qslips');
    await expect(page.getByRole('heading', { name: 'Quotation Request Slips' })).toBeVisible();
    await assertTableFields(page);
    await assertNoHorizontalOverflow(page);
    await takeViewportScreenshot(page, `qslips-${sizeLabel}`);
  });
}
