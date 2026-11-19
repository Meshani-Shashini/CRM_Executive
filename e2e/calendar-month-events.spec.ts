import { expect, test } from '@playwright/test';

const viewports = [
  { width: 1024, height: 768 },
  { width: 1190, height: 650 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

test('month calendar marks event days and lists selected-day events below the grid', async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto('/#/calendar');

    const monthGrid = page.getByTestId('calendar-month-grid');
    await expect(monthGrid).toBeVisible();
    await expect(page.getByTestId('calendar-weekdays').locator('div')).toHaveText(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    await expect(page.getByRole('heading', { name: /^[A-Za-z]+ 20\d{2}$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Previous month' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next month' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Today' })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Show calendar events' })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Filter calendar by type' })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Filter calendar by pipeline' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Upcoming' })).toHaveCount(0);

    const selectedEvents = page.getByTestId('calendar-selected-events');
    await expect(selectedEvents).toBeVisible();
    const gridLayout = await monthGrid.evaluate((grid) => {
      const gridBounds = grid.getBoundingClientRect();
      const listBounds = grid.parentElement?.querySelector('[data-testid="calendar-selected-events"]')?.getBoundingClientRect();
      if (!listBounds) throw new Error('Selected-day events are not rendered below the month grid.');
      return { gridHeight: gridBounds.height, gridBottom: gridBounds.bottom, listTop: listBounds.top };
    });
    expect(gridLayout.gridHeight, `month grid has usable height at ${viewport.width}x${viewport.height}`)
      .toBeGreaterThan(180);
    expect(gridLayout.listTop, `selected-day list follows the grid at ${viewport.width}x${viewport.height}`)
      .toBeGreaterThanOrEqual(gridLayout.gridBottom);
    const pageBounds = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }));
    expect(pageBounds.width, `calendar fits horizontally at ${viewport.width}x${viewport.height}`)
      .toBeLessThanOrEqual(viewport.width);
    if (viewport.width >= 1024) {
      expect(pageBounds.height, `calendar fits vertically at ${viewport.width}x${viewport.height}`)
        .toBeLessThanOrEqual(viewport.height);
    }

    const dayEventCounts = await monthGrid.getByTestId('calendar-month-day').evaluateAll((days) =>
      days.map((day) => ({
        expected: Number(day.getAttribute('data-event-count')),
        rendered: day.querySelectorAll('[data-testid="calendar-event-dot"]').length,
      })),
    );
    expect(dayEventCounts.every(({ expected, rendered }) => rendered === Math.min(expected, 3)), `event dots are compact at ${viewport.width}x${viewport.height}`)
      .toBe(true);

    let selectedEventCount = 0;
    for (let month = 0; month < 24 && selectedEventCount === 0; month++) {
      const eventfulDays = monthGrid.locator('[data-event-count]:not([data-event-count="0"])');
      if (await eventfulDays.count() > 0) {
        selectedEventCount = Number(await eventfulDays.first().getAttribute('data-event-count'));
        await eventfulDays.first().click();
        break;
      }
      await page.getByRole('button', { name: 'Previous month' }).click();
    }
    if (selectedEventCount > 0) {
      await expect(selectedEvents.getByTestId('calendar-selected-event')).toHaveCount(selectedEventCount);
      await expect(selectedEvents.locator('time')).toHaveCount(selectedEventCount);
    } else {
      await expect(selectedEvents.getByText('No events on this day.')).toBeVisible();
    }
  }
});
