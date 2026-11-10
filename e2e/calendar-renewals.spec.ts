import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const screenshotDirectory = path.resolve('qa-screenshots');

test.beforeAll(() => {
  mkdirSync(screenshotDirectory, { recursive: true });
});

test('calendar and renewals render with responsive layouts and screenshots', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/#/calendar');
  await expect(page.getByRole('banner').getByRole('heading', { name: 'Calendar' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('heading', { name: 'Calendar' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'month', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'week', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'agenda', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Coming soon' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Coming soon' })).toHaveAttribute('aria-expanded', 'false');
  await page.screenshot({
    path: path.join(screenshotDirectory, 'calendar-1280x900.png'),
    fullPage: true,
    animations: 'disabled',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1280);
  await page.getByRole('button', { name: /Deal SLA/ }).first().click();
  await expect(page).toHaveURL(/#\/deals\?id=/);
  await expect(page.getByTestId('activity-summary')).toBeVisible();
  await page.goto('/#/calendar');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('[aria-label="agenda calendar"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'month', exact: true })).toBeHidden();
  await page.screenshot({
    path: path.join(screenshotDirectory, 'calendar-390x844.png'),
    fullPage: true,
    animations: 'disabled',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/#/renewals');
  await expect(page.getByRole('banner').getByRole('heading', { name: 'Renewals' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('heading', { name: 'Renewals' })).toHaveCount(0);
  await expect(page.getByRole('table', { name: /renewals/i }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open deal' }).first()).toBeVisible();
  await page.screenshot({
    path: path.join(screenshotDirectory, 'renewals-1280x900.png'),
    fullPage: true,
    animations: 'disabled',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1280);
  await page.getByRole('link', { name: 'Open deal' }).first().click();
  await expect(page).toHaveURL(/#\/deals\?id=/);
  await expect(page.getByTestId('activity-summary')).toBeVisible();

  await page.goto('/#/renewals');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: path.join(screenshotDirectory, 'renewals-390x844.png'),
    fullPage: true,
    animations: 'disabled',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
