import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const viewports = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1920, height: 1080 },
];

const screenshotsDirectory = path.resolve('e2e/screenshots');

async function assertTerminalConnector(page: Page, state: 'open' | 'lost' | 'won') {
  const connector = await page.locator('.deal-stage-stepper__step').nth(-2).evaluate((step) => {
    const style = getComputedStyle(step, '::after');
    return { backgroundImage: style.backgroundImage, backgroundColor: style.backgroundColor };
  });
  if (state === 'open') {
    expect(connector.backgroundImage).toContain('repeating-linear-gradient');
  } else if (state === 'lost') {
    expect(connector.backgroundColor).toBe('rgb(217, 66, 94)');
  } else {
    expect(connector.backgroundColor).toBe('rgb(52, 60, 70)');
  }
}

async function captureStepper(page: Page, state: 'open' | 'lost' | 'won', viewport: number, nodeCount: number) {
  const stepper = page.getByRole('list', { name: 'Deal pipeline stages' });
  await expect(stepper).toBeVisible();
  await expect(stepper.getByRole('listitem')).toHaveCount(nodeCount);
  await assertStepperGeometry(page);
  await assertTerminalConnector(page, state);
  await stepper.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(screenshotsDirectory, `deal-stepper-${state === 'open' ? '' : `${state}-`}${viewport}x${page.viewportSize()?.height}.png`),
    animations: 'disabled',
  });
  return stepper;
}

async function selectDealForInspection(page: Page, title: string) {
  const backToDeals = page.getByRole('button', { name: 'Back to deals' });
  if (await backToDeals.count()) {
    await backToDeals.click();
  } else {
    const goToList = page.getByRole('button', { name: 'Go to List' });
    if (await goToList.count()) await goToList.click();
  }
  const dealRow = page.getByRole('link', { name: `Open deal details for ${title}` });
  await dealRow.focus();
  await page.keyboard.press('Enter');
}

async function assertStepperGeometry(page: Page) {
  const geometry = await page.locator('.deal-stage-stepper-container').evaluate((container) => {
    const labels = [...container.querySelectorAll<HTMLElement>('.deal-stage-stepper__label')]
      .map((label) => {
        const { x, y, right, bottom } = label.getBoundingClientRect();
        return { x, y, right, bottom };
      });
    const steps = [...container.querySelectorAll<HTMLElement>('.deal-stage-stepper__step')];
    const mobile = container.getBoundingClientRect().width < 640;
    const connectors = steps.slice(0, -1).map((step, index) => {
      const bounds = step.getBoundingClientRect();
      const next = steps[index + 1].getBoundingClientRect();
      const x = mobile ? bounds.x + 14 : bounds.x + bounds.width / 2;
      const y = mobile ? bounds.y + bounds.height / 2 : bounds.y + 12;
      return {
        x,
        y,
        right: mobile ? x + 1 : next.x + next.width / 2,
        bottom: mobile ? next.y + next.height / 2 : y + 1,
      };
    });
    return { labels, connectors };
  });

  for (let index = 0; index < geometry.labels.length; index += 1) {
    const label = geometry.labels[index];
    for (let neighbor = index + 1; neighbor < geometry.labels.length; neighbor += 1) {
      const other = geometry.labels[neighbor];
      const intersects = label.x < other.right && label.right > other.x
        && label.y < other.bottom && label.bottom > other.y;
      expect(intersects, `stage labels ${index + 1} and ${neighbor + 1} overlap`).toBe(false);
    }
  }
  for (const [connectorIndex, connector] of geometry.connectors.entries()) {
    for (const [labelIndex, label] of geometry.labels.entries()) {
      const intersects = connector.x < label.right && connector.right > label.x
        && connector.y < label.bottom && connector.bottom > label.y;
      expect(intersects, `connector ${connectorIndex + 1} crosses label ${labelIndex + 1}`).toBe(false);
    }
  }

  const overflow = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    stepper: (() => {
      const element = document.querySelector<HTMLElement>('.deal-stage-stepper-container');
      return element ? { scroll: element.scrollWidth, client: element.clientWidth } : null;
    })(),
  }));
  expect(overflow.document).toBe(overflow.viewport);
  expect(overflow.body).toBeLessThanOrEqual(overflow.viewport);
  expect(overflow.stepper?.scroll).toBeLessThanOrEqual(overflow.stepper?.client ?? 0);
}

test.beforeAll(() => {
  mkdirSync(screenshotsDirectory, { recursive: true });
});

for (const viewport of viewports) {
  test(`deal stage stepper fits at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/#/deals');
    await page.getByRole('tab', { name: 'Inspection' }).click();
    await expect(page.getByRole('heading', { name: 'No record selected' })).toBeVisible();
    await page.getByRole('button', { name: 'Go to List' }).click();
    await selectDealForInspection(page, 'Bonavista Maldives - Contractors All Risks');

    const stepper = await captureStepper(page, 'open', viewport.width, 6);
    await expect(stepper.getByText('Risk Survey', { exact: true })).toBeVisible();
    await expect(stepper.getByText('Market Tender', { exact: true })).toBeVisible();
    expect(await stepper.getByRole('listitem').last().getByRole('button').getAttribute('aria-label'))
      .toContain('Lost / Market Declined');
    await stepper.getByRole('listitem').last().getByRole('button').click();
    await expect(page.getByRole('heading', { name: 'Update deal stage' })).toBeVisible();
    const lossReason = page.getByLabel('Loss reason (required)');
    await expect(lossReason.locator('option')).toHaveText([
      'Select a reason',
      'Incumbent Retained',
      'Market Capacity Declined',
      'Uncompetitive Deductibles',
      'Self-Insured',
    ]);
    await page.getByRole('button', { name: 'Save stage' }).click();
    await expect(page.getByRole('alert')).toHaveText('A loss reason is mandatory.');
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('button', { name: /Policy Bound \/ Won/ }).click();
    await expect(page.getByRole('heading', { name: 'Update deal stage' })).toBeVisible();
    await expect(page.getByText('Win reason (required)')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();

    await selectDealForInspection(page, 'Coral Construction Machinery Cover');
    const lostStepper = await captureStepper(page, 'lost', viewport.width, 6);
    await expect(lostStepper.locator('.deal-stage-stepper__step.is-dimmed')).toHaveCount(5);
    await expect(lostStepper.locator('.deal-stage-stepper__step.is-lost-closed .deal-stage-stepper__button'))
      .toBeDisabled();
    await expect(page.getByRole('status')).toContainText('Lost: Demo loss reason');

    await selectDealForInspection(page, 'Lagoon Resort Fire Cover');
    const wonStepper = await captureStepper(page, 'won', viewport.width, 5);
    await expect(wonStepper.locator('.deal-stage-stepper__step.is-complete')).toHaveCount(4);
    await expect(wonStepper.locator('.deal-stage-stepper__step.is-lost-won .deal-stage-stepper__button'))
      .toBeDisabled();
  });
}
