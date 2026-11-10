import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const viewports = [
  { width: 1024, height: 768 },
  { width: 1190, height: 650 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
];

test('Pipelines board keeps all stage columns in one viewport-filling row', async ({ page }) => {
  const screenshotDirectory = path.resolve('e2e/screenshots');
  mkdirSync(screenshotDirectory, { recursive: true });

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto('/#/pipelines');

    const board = page.getByTestId('pipelines-board');
    const columns = page.getByTestId('pipelines-board-column');
    const headers = page.getByTestId('pipelines-stage-header');
    const bodies = page.getByTestId('pipelines-column-body');

    await expect(board).toBeVisible();
    await expect(columns).toHaveCount(9);
    await expect(headers).toHaveCount(9);
    await expect(bodies).toHaveCount(9);

    const headerTops = await headers.evaluateAll((elements) =>
      elements.map((element) => Math.round(element.getBoundingClientRect().top)),
    );
    expect(new Set(headerTops).size, `stage headers share one row at ${viewport.width}x${viewport.height}`).toBe(1);

    const boardMetrics = await board.evaluate((element) => {
      const styles = getComputedStyle(element);
      const gap = Number.parseFloat(styles.columnGap);
      return {
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        minimumWidth: 9 * 130 + 8 * gap,
      };
    });
    expect(
      boardMetrics.scrollWidth > boardMetrics.clientWidth,
      `board horizontal scrolling matches available width at ${viewport.width}x${viewport.height}`,
    ).toBe(boardMetrics.clientWidth < boardMetrics.minimumWidth);

    const columnWidths = await columns.evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().width),
    );
    expect(columnWidths.every((width) => width >= 130), `minimum column width at ${viewport.width}x${viewport.height}`)
      .toBe(true);
    if (boardMetrics.clientWidth >= boardMetrics.minimumWidth) {
      expect(Math.max(...columnWidths) - Math.min(...columnWidths), 'columns share available width equally').toBeLessThanOrEqual(1);
    }

    expect(await bodies.evaluateAll((elements) =>
      elements.every((element) => getComputedStyle(element).overflowY === 'auto'),
    )).toBe(true);
    if (viewport.width >= 1024) {
      const independentColumnScroll = await page.evaluate(() => {
        const bodies = [...document.querySelectorAll<HTMLElement>('[data-testid="pipelines-column-body"]')];
        return bodies.map((body) => {
          const filler = document.createElement('div');
          filler.style.height = '2000px';
          body.appendChild(filler);
          body.scrollTop = 40;
          const scrollTop = body.scrollTop;
          body.scrollTop = 0;
          filler.remove();
          return scrollTop;
        });
      });
      expect(independentColumnScroll.every((scrollTop) => scrollTop > 0), 'each column body scrolls independently').toBe(true);
      expect(
        await page.evaluate(() => document.documentElement.scrollHeight),
        `page vertical scrolling at ${viewport.width}x${viewport.height}`,
      ).toBeLessThanOrEqual(viewport.height);
    }
    const pageMetrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      boardAncestors: (() => {
        const ancestors = [];
        let element = document.querySelector<HTMLElement>('[data-testid="pipelines-board"]');
        while (element) {
          const bounds = element.getBoundingClientRect();
          const styles = getComputedStyle(element);
          ancestors.push({
            tag: element.tagName,
            className: typeof element.className === 'string' ? element.className : '',
            left: Math.round(bounds.left),
            right: Math.round(bounds.right),
            width: Math.round(bounds.width),
            scrollWidth: element.scrollWidth,
            overflowX: styles.overflowX,
          });
          element = element.parentElement;
        }
        return ancestors;
      })(),
    }));
    expect(
      pageMetrics.scrollWidth,
      `page horizontal scrolling at ${viewport.width}x${viewport.height}: ${JSON.stringify(pageMetrics.boardAncestors)}`,
    ).toBeLessThanOrEqual(viewport.width);

    if (viewport.width >= 1024) {
      await page.screenshot({
        path: path.join(screenshotDirectory, `compact-pipelines-${viewport.width}x${viewport.height}.png`),
        fullPage: true,
        animations: 'disabled',
      });
    }
  }
});
