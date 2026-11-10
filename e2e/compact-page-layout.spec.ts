import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const viewports = [
  { width: 1024, height: 768 },
  { width: 1180, height: 820 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
];

const pages = [
  { route: 'calendar', title: 'Calendar', description: 'Read-only schedule derived from activities, records, renewals, and SLAs.' },
  { route: 'vendors', title: 'Vendors', description: 'Insurers, reinsurers, surveyors, and loss adjusters managed as active broker-side vendor records.' },
  { route: 'qslips', title: 'Quotation Request Slips', description: 'Track market requests linked to open deals.' },
  { route: 'renewals', title: 'Renewals', description: 'Policies due now or within the next 120 days, derived from existing records.' },
  { route: 'funnels', title: 'Funnels', description: 'Stage entries and conversion rates calculated from deal stage history.' },
  { route: 'pipelines', title: 'Pipelines', description: 'Move opportunities through configured insurance stages.' },
];

test('compact page toolbars fit responsively and Calendar stays in the viewport', async ({ page }) => {
  const screenshotDirectory = path.resolve('e2e/screenshots');
  mkdirSync(screenshotDirectory, { recursive: true });

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const size = `${viewport.width}x${viewport.height}`;

    for (const { route, title, description } of pages) {
      await page.goto(`/#/${route}`);
      const header = page.getByRole('banner');
      const toolbar = page.locator(`[data-page-toolbar="${route}"]`);
      const content = page.locator(`[data-page-content="${route}"]`);

      await expect(header.getByRole('heading', { name: title, exact: true })).toBeVisible();
      await expect(header.getByRole('button', { name: description, exact: true })).toBeVisible();
      await expect(page.getByRole('main').getByText(description, { exact: true })).toHaveCount(0);
      await expect(toolbar).toBeVisible();
      await expect(content).toBeVisible();

      const headerBottom = await header.evaluate((element) => element.getBoundingClientRect().bottom);
      const toolbarTop = await toolbar.evaluate((element) => element.getBoundingClientRect().top);
      expect(toolbarTop - headerBottom, `${route} toolbar placement at ${size}`).toBeLessThanOrEqual(56);
      expect(toolbarTop).toBeGreaterThanOrEqual(headerBottom);
      if (viewport.width >= 1024) {
        const toolbarBounds = await toolbar.boundingBox();
        const contentBounds = await content.boundingBox();
        expect(toolbarBounds).not.toBeNull();
        expect(contentBounds).not.toBeNull();
        expect(toolbarBounds!.height, `${route} toolbar wraps at ${size}`).toBeLessThanOrEqual(44);
        expect(contentBounds!.y - headerBottom, `${route} content starts too low at ${size}`).toBeLessThanOrEqual(56);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${route} horizontal overflow at ${size}`)
        .toBeLessThanOrEqual(viewport.width);

      if (route === 'calendar' && viewport.width >= 1024) {
        expect(await page.evaluate(() => document.documentElement.scrollHeight), `Calendar page scroll at ${size}`)
          .toBeLessThanOrEqual(viewport.height);
        const monthGrid = page.getByTestId('calendar-month-grid');
        await expect(monthGrid).toBeVisible();
        const gridBounds = await monthGrid.boundingBox();
        expect(gridBounds).not.toBeNull();
        expect(gridBounds!.y + gridBounds!.height, `Calendar month grid clipped at ${size}`)
          .toBeLessThanOrEqual(viewport.height);
        const rowTops = await monthGrid.locator(':scope > *').evaluateAll((cells) =>
          [...new Set(cells.map((cell) => Math.round(cell.getBoundingClientRect().top)))],
        );
        expect(rowTops, `Calendar month rows at ${size}`).toHaveLength(6);

        for (const view of ['week', 'agenda']) {
          await page.getByRole('button', { name: view, exact: true }).click();
          const internalScroller = page.locator('.calendar-view-panel > .overflow-y-auto');
          await expect(internalScroller).toBeVisible();
          await expect(internalScroller).toHaveCSS('overflow-y', 'auto');
          expect(await page.evaluate(() => document.documentElement.scrollHeight), `Calendar ${view} page scroll at ${size}`)
            .toBeLessThanOrEqual(viewport.height);
        }
        await page.getByRole('button', { name: 'month', exact: true }).click();
      }

      await page.screenshot({
        path: path.join(screenshotDirectory, `compact-${route}-${size}.png`),
        fullPage: true,
        animations: 'disabled',
      });
    }
  }
});
