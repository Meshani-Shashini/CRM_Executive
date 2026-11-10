import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const viewports = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 820, height: 1180 },
  { width: 1024, height: 768 },
  { width: 1180, height: 820 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
];

test('Deals list header matches Leads and stays compact across viewports', async ({ page }) => {
  test.setTimeout(120_000);
  const screenshotDirectory = path.resolve('e2e/screenshots');
  mkdirSync(screenshotDirectory, { recursive: true });

  for (const viewport of viewports) {
    const sizeLabel = `${viewport.width}x${viewport.height}`;
    await page.setViewportSize(viewport);
    let leadsMetrics: { height: number; fontSize: string; padding: string[]; color: string } | undefined;
    if (viewport.width >= 900) {
      await page.goto('/#/leads');
      const leadsTable = page.getByRole('table', { name: 'Leads' });
      await expect(leadsTable).toBeVisible();
      leadsMetrics = await leadsTable.locator('thead').evaluate((header) => {
        const cell = header.querySelector('th')!;
        const style = getComputedStyle(cell);
        return {
          height: header.getBoundingClientRect().height,
          fontSize: style.fontSize,
          padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft],
          color: style.color,
        };
      });
    }

    await page.goto('/#/deals?view=list');
    const dealsTable = page.locator('.deals-page-list-fit table');
    await expect(dealsTable).toBeVisible();
    const dealsHeader = dealsTable.locator('thead');
    const dealsHeaderCells = dealsHeader.locator('th');

    if (viewport.width >= 900) {
      const dealsMetrics = await dealsHeader.evaluate((header) => {
        const cell = header.querySelector('th')!;
        const style = getComputedStyle(cell);
        return {
          height: header.getBoundingClientRect().height,
          fontSize: style.fontSize,
          padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft],
          color: style.color,
        };
      });
      expect(leadsMetrics).toBeDefined();
      expect(Math.abs(dealsMetrics.height - leadsMetrics!.height), `header height differs at ${sizeLabel}`).toBeLessThanOrEqual(2);
      expect(dealsMetrics.fontSize).toBe(leadsMetrics.fontSize);
      expect(dealsMetrics.padding).toEqual(leadsMetrics.padding);
      expect(dealsMetrics.color).toBe(leadsMetrics.color);

      const wrappedHeaders = await dealsHeaderCells.evaluateAll((cells) =>
        cells.flatMap((cell) => {
          const button = cell.querySelector('button');
          if (!button?.firstChild) return [];
          const range = document.createRange();
          range.selectNode(button.firstChild);
          return range.getClientRects().length === 1 ? [] : [button.textContent?.trim()];
        }),
      );
      expect(wrappedHeaders, `wrapped header labels at ${sizeLabel}`).toEqual([]);
    } else if (viewport.width >= 640) {
      const verticalAlignments = await dealsHeaderCells.evaluateAll((cells) =>
        cells.map((cell) => getComputedStyle(cell).verticalAlign),
      );
      expect(verticalAlignments).toEqual(Array(verticalAlignments.length).fill('middle'));
      const cellHeights = await dealsHeaderCells.evaluateAll((cells) =>
        cells.map((cell) => cell.getBoundingClientRect().height),
      );
      expect(new Set(cellHeights).size).toBe(1);
    } else {
      await expect(dealsHeader).toBeHidden();
    }

    await expect(dealsHeaderCells.nth(0).locator('button')).toHaveAttribute('title', 'Title');
    await expect(dealsHeaderCells.nth(0).locator('button')).toHaveAttribute('aria-label', 'Sort by Title');
    await expect(dealsHeader.locator('[aria-hidden="true"]')).toHaveCount(0);

    await page.screenshot({
      path: path.join(screenshotDirectory, `deals-list-${sizeLabel}.png`),
      fullPage: true,
      animations: 'disabled',
    });

    if (viewport.width >= 900) {
      const expectedCloseButton = dealsHeaderCells.locator('button[aria-label="Sort by Expected Close Date"]');
      const expectedCloseHeader = expectedCloseButton.locator('xpath=..');
      const originalHeight = await dealsHeader.evaluate((header) => header.getBoundingClientRect().height);
      await expectedCloseButton.click();
      await expect(expectedCloseHeader).toHaveAttribute('aria-sort', 'descending');
      await expect(expectedCloseHeader.locator('[aria-hidden="true"]')).toHaveText('↓');
      const sortedHeaderHeight = await dealsHeader.evaluate((header) => header.getBoundingClientRect().height);
      expect(Math.abs(sortedHeaderHeight - originalHeight), `sorting changed header height at ${sizeLabel}`).toBeLessThanOrEqual(1);
      const sortedLabelLines = await expectedCloseButton.evaluate((button) => {
        const range = document.createRange();
        range.selectNode(button.firstChild!);
        return range.getClientRects().length;
      });
      expect(sortedLabelLines, `Expected Close wrapped at ${sizeLabel}`).toBe(1);
    }
  }
});
