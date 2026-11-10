import { expect, test } from '@playwright/test';

const viewports = [
  { width: 1024, height: 768 },
  { width: 1190, height: 650 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

test('month cells show all scheduled events until their available space is used', async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto('/#/calendar');

    const monthGrid = page.getByTestId('calendar-month-grid');
    await expect(monthGrid).toBeVisible();
    await expect(monthGrid.getByText(/\+\d+ more/)).toHaveCount(0);
    const gridLayout = await monthGrid.evaluate((grid) => {
      const panel = grid.closest('.calendar-view-panel');
      if (!panel) throw new Error('Calendar month grid is not inside its view panel.');
      const gridBounds = grid.getBoundingClientRect();
      const panelBounds = panel.getBoundingClientRect();
      return {
        gridHeight: gridBounds.height,
        panelHeight: panelBounds.height,
        bottomSpace: panelBounds.bottom - gridBounds.bottom,
      };
    });
    expect(gridLayout.gridHeight / gridLayout.panelHeight, `month grid fills panel at ${viewport.width}x${viewport.height}`)
      .toBeGreaterThan(0.7);
    expect(gridLayout.bottomSpace, `month grid leaves no excess bottom space at ${viewport.width}x${viewport.height}`)
      .toBeLessThanOrEqual(28);

    const dayEventCounts = await monthGrid.getByTestId('calendar-month-day').evaluateAll((days) =>
      days.map((day) => ({
        expected: Number(day.getAttribute('data-event-count')),
        rendered: day.querySelectorAll('[data-testid="calendar-day-events"] > button').length,
        listOverflow: getComputedStyle(day.querySelector<HTMLElement>('[data-testid="calendar-day-events"]')!).overflowY,
      })),
    );
    expect(dayEventCounts.every(({ expected, rendered }) => rendered === expected), `all events render at ${viewport.width}x${viewport.height}`)
      .toBe(true);
    expect(dayEventCounts.every(({ listOverflow }) => listOverflow === 'auto'), `day cells contain event overflow at ${viewport.width}x${viewport.height}`)
      .toBe(true);
  }
});
