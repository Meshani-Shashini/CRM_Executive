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
    await expect(page.getByText(/Lead 360/i)).toHaveCount(0);
    await assertTableFields(page);
    await assertNoHorizontalOverflow(page);
    const leadCellStyle = await page.locator('.fit-wrap table tbody tr').first()
      .locator('td[data-label="Client Name"]').evaluate((cell) => ({
        fontSize: getComputedStyle(cell).fontSize,
        color: getComputedStyle(cell).color,
      }));
    const leadRowHeights = await page.locator('.fit-wrap table tbody tr')
      .evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
    await takeViewportScreenshot(page, `leads-${sizeLabel}`);
    const firstLead = page.getByRole('link', { name: /^Open lead details for/ }).first();
    await firstLead.press('Enter');
    await expect(page.getByTestId('activity-summary')).toBeVisible();
    await expect(page.getByText(/Lead 360/i)).toHaveCount(0);
    await expect(page.getByText('Deals & Leads', { exact: true })).toHaveCount(0);
    await assertNoHorizontalOverflow(page);
    await takeViewportScreenshot(page, `leads-inspection-${sizeLabel}`);

    await page.goto('/#/deals');
    const tabs = page.getByRole('tablist', { name: 'Deal workspace views' }).getByRole('tab');
    await expect(tabs).toHaveText(['List', 'Kanban', 'Inspection']);
    await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
    await tabs.nth(2).click();
    await expect(page.getByRole('heading', { name: 'No record selected' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Go to List' })).toBeVisible();
    await expect(page.getByText('Deals & Leads', { exact: true })).toHaveCount(0);
    await expect(page.getByText(/Lead 360/i)).toHaveCount(0);
    await page.getByRole('button', { name: 'Go to List' }).click();
    await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
    await assertTableFields(page);
    await assertNoHorizontalOverflow(page);
    const dealCells = page.locator('.deals-list-fit tbody tr[data-pipeline-id] td[data-label="Client"]');
    await expect(dealCells.first()).toHaveCSS('font-size', leadCellStyle.fontSize);
    await expect(dealCells.first()).toHaveCSS('color', leadCellStyle.color);
    const linkedLeadCells = page.locator('.deals-list-fit tbody tr[data-pipeline-id] td[data-label="Linked Lead"]');
    for (const cell of await linkedLeadCells.all()) {
      await expect(cell).not.toContainText(/lead-d-\d+/);
    }
    if (viewport.width >= 640) {
      const maxLeadRowHeight = Math.max(...leadRowHeights);
      const dealRowHeights = await page.locator('.deals-list-fit tbody tr[data-pipeline-id]')
        .evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
      for (const height of dealRowHeights) {
        expect(height, `deal row height ${height}px exceeds lead row height ${maxLeadRowHeight}px + 8px`).toBeLessThanOrEqual(maxLeadRowHeight + 8);
      }
    }
    const requiredNoWrapLabels = ['Pipeline', 'Deal Stage', 'Insurance', 'Value', 'Expected close'];
    const noWrapResults = await page.locator('.deals-list-fit tbody tr[data-pipeline-id]').evaluateAll((rows, labels) =>
      rows.flatMap((row) => labels.map((label) => {
        const cell = row.querySelector<HTMLElement>(`td[data-label="${label}"]`);
        return { label, whiteSpace: cell ? getComputedStyle(cell).whiteSpace : 'missing' };
      })),
    requiredNoWrapLabels);
    expect(noWrapResults.every(({ whiteSpace }) => whiteSpace === 'nowrap')).toBe(true);
    await takeViewportScreenshot(page, `deals-list-${sizeLabel}`);

    const firstDeal = page.getByRole('link', { name: /^Open deal details for/ }).first();
    const stageTrigger = firstDeal.getByRole('button', { name: /^Change stage for/ });
    const stageTypography = await stageTrigger.evaluate((trigger) => {
      const stageCell = trigger.closest('td');
      return {
        trigger: getComputedStyle(trigger).fontSize,
        neighboringCell: getComputedStyle(stageCell?.previousElementSibling ?? trigger).fontSize,
        title: trigger.getAttribute('title'),
        stage: trigger.querySelector('.pill')?.textContent?.trim(),
      };
    });
    expect(stageTypography.trigger).toBe(stageTypography.neighboringCell);
    expect(stageTypography.title).toContain(stageTypography.stage ?? '');
    await stageTrigger.click();
    const stageMenu = page.getByRole('menu', { name: /^Stages for/ });
    const stageItems = stageMenu.getByRole('menuitem');
    await expect(stageMenu).toBeVisible();
    await expect(stageItems.first()).toBeFocused();
    const rowPipelineId = await firstDeal.getAttribute('data-pipeline-id');
    expect(await stageItems.count()).toBeGreaterThan(0);
    for (const item of await stageItems.all()) {
      await expect(item).toHaveAttribute('data-pipeline-id', rowPipelineId ?? '');
      await expect(item).toHaveCSS('white-space', 'nowrap');
    }
    const stageNames = await stageItems.allTextContents();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    await expect(stageMenu).toHaveCount(0);
    await expect(stageTrigger).toBeFocused();

    const lastDeal = page.locator('.deals-list-fit tbody tr[data-pipeline-id]').last();
    const lastStageTrigger = lastDeal.getByRole('button', { name: /^Change stage for/ });
    await lastStageTrigger.scrollIntoViewIfNeeded();
    await lastStageTrigger.click();
    const bottomStageMenu = page.getByRole('menu', { name: /^Stages for/ });
    const bottomAnchorTop = await lastStageTrigger.evaluate((trigger) => trigger.getBoundingClientRect().top);
    const menuBounds = await bottomStageMenu.evaluate((menu) => {
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
    if (viewport.width < 640) expect(menuBounds.bottom).toBeLessThanOrEqual(bottomAnchorTop);
    await page.getByRole('heading', { name: 'Deals list' }).click();
    await expect(bottomStageMenu).toHaveCount(0);

    const dealActionsButton = firstDeal.getByRole('button', { name: /^Actions for/ });
    await dealActionsButton.click();
    const dealActionsMenu = page.getByRole('menu', { name: /^Deal actions for/ });
    const deleteDealItem = dealActionsMenu.getByRole('menuitem', { name: 'Delete deal' });
    await expect(deleteDealItem).toBeVisible();
    await expect(deleteDealItem).toHaveCSS('white-space', 'nowrap');
    await expect(deleteDealItem).toHaveCSS('overflow-wrap', 'normal');
    await expect(deleteDealItem).toHaveCSS('word-break', 'normal');
    const actionMenuBounds = await dealActionsMenu.evaluate((menu) => {
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
    expect(actionMenuBounds.isPortaled).toBe(true);
    expect(actionMenuBounds.left).toBeGreaterThanOrEqual(0);
    expect(actionMenuBounds.top).toBeGreaterThanOrEqual(0);
    expect(actionMenuBounds.right).toBeLessThanOrEqual(actionMenuBounds.viewportWidth);
    expect(actionMenuBounds.bottom).toBeLessThanOrEqual(actionMenuBounds.viewportHeight);
    await assertNoHorizontalOverflow(page);
    await dealActionsButton.click();

    const currentStage = stageTypography.stage;
    const nextStageIndex = stageNames.findIndex((stage) => stage !== currentStage);
    if (nextStageIndex >= 0) {
      await stageTrigger.click();
      await expect(stageMenu).toBeVisible();
      for (let index = 0; index < nextStageIndex; index += 1) await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { name: 'Update deal stage' })).toBeVisible();
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.reload();
      await expect(page.locator('.deals-list-fit table')).toBeVisible();
    }

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

    const firstKanbanDeal = page.locator('.deals-board > section button').first();
    await firstKanbanDeal.click();
    await expect(page.getByTestId('deal-stage-stepper')).toBeVisible();
    await expect(page.getByTestId('activity-summary')).toBeVisible();
    await expect(page.getByText('Deals & Leads', { exact: true })).toHaveCount(0);
    await expect(page.getByText(/Lead 360/i)).toHaveCount(0);
    const detailBounds = await page.getByTestId('deal-detail-cards').boundingBox();
    const stepperBounds = await page.getByTestId('deal-stage-stepper').boundingBox();
    const activityBounds = await page.getByTestId('workspace-activity').boundingBox();
    expect(detailBounds).not.toBeNull();
    expect(stepperBounds).not.toBeNull();
    expect(activityBounds).not.toBeNull();
    expect(stepperBounds!.y).toBeGreaterThan(detailBounds!.y + detailBounds!.height);
    expect(stepperBounds!.y + stepperBounds!.height).toBeLessThan(activityBounds!.y);
    await assertNoHorizontalOverflow(page);
    await takeViewportScreenshot(page, `deals-inspection-${sizeLabel}`);

    await page.goto('/#/vendors');
    await expect(page.getByRole('main').getByRole('heading', { name: 'Vendors' })).toBeVisible();
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
    await expect(page.getByRole('main').getByRole('heading', { name: 'Quotation Request Slips' })).toBeVisible();
    await assertTableFields(page);
    await assertNoHorizontalOverflow(page);
    await takeViewportScreenshot(page, `qslips-${sizeLabel}`);
  });
}
