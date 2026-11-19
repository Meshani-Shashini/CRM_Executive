import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const viewports = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1920, height: 1080 },
];

type Board = {
  name: string;
  testId: string;
  open: (page: Page) => Promise<void>;
};

function dateDisplay(daysFromToday: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date).replaceAll(' ', '-');
}

async function createLeadFixture(
  page: Page,
  organization: string,
  title: string,
  contact: string,
  email: string,
  phone: string,
) {
  await page.getByRole('button', { name: 'Lead', exact: true }).click();
  await page.locator('input[list="lead-organizations"]').fill(organization);
  await page.locator('input[list="lead-organizations"]').press('Tab');
  await page.getByRole('heading', { name: 'Create New Customer / Organization' }).waitFor();
  await page.locator('#new-organization-form input[name="name"]').fill(organization);
  await page.getByRole('button', { name: 'Create Organization' }).click();

  const leadForm = page.locator('#new-lead-form');
  await leadForm.getByLabel('Primary Contact Name *').fill(contact);
  await leadForm.getByLabel('Contact Email *').fill(email);
  await leadForm.getByLabel('Contact Phone *').fill(phone);
  await leadForm.getByLabel('WhatsApp').fill(phone);
  await leadForm.getByLabel('Telegram').fill('@sharedkanban');
  await leadForm.locator('input[name="title"]').fill(title);
  await leadForm.getByLabel('Type of Insurance Product *').selectOption('HR');
  await leadForm.getByLabel('Deal pipeline').selectOption({ label: 'Commercial Lines Brokerage' });
  await leadForm.getByLabel('Lead Value Currency').selectOption('MVR');
  await leadForm.locator('input[name="value"]').fill('100000');
  await leadForm.getByRole('textbox', { name: 'Expected close date' }).fill(dateDisplay(30));
  await page.getByRole('button', { name: 'Save', exact: true }).click();
}

async function createBoardFixtures(page: Page) {
  const organization = 'Shared Kanban QA Organization';
  const title = 'Shared Kanban QA Placement';
  const phone = '+960 7779876';
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/#/leads');
  await createLeadFixture(page, organization, title, 'Nadia Shared', 'nadia@shared-kanban.example', phone);

  await page.goto('/#/clients');
  await page.getByRole('row').filter({ hasText: organization }).click();
  await page.getByRole('button', { name: 'Edit Client' }).click();
  const clientForm = page.locator('#edit-client-form');
  await clientForm.locator('input[name="tin"]').fill('TIN-ML-22222');
  await clientForm.locator('input[name="phone"]').fill(phone);
  await clientForm.locator('input[name="email"]').fill('nadia@shared-kanban.example');
  await clientForm.locator('input[name="contactPerson"]').fill('Nadia Shared');
  await clientForm.locator('textarea[name="address"]').fill('Hulhumale, Maldives');
  await clientForm.locator('input[name="country"]').fill('Maldives');
  await clientForm.locator('input[name="class"]').fill('Commercial');
  await clientForm.locator('input[name="productCode"]').fill('HR');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await page.getByRole('dialog', { name: organization })
    .getByRole('button', { name: 'Close client details' }).click();

  await page.goto('/#/leads');
  const leadRow = page.getByRole('link', { name: `Open lead details for ${title}` });
  await leadRow.getByRole('button', { name: `Actions for ${title}` }).click();
  await page.getByRole('menuitem', { name: 'Convert to Deal' }).click();
  await page.goto('/#/deals');
  await page.getByRole('tab', { name: 'List' }).click();
  await expect(page.getByRole('link', { name: `Open deal details for ${title}` })).toBeVisible();
  await page.goto('/#/leads');
  await createLeadFixture(
    page,
    'Shared Kanban Board Organization',
    'Shared Kanban Board Lead',
    'Mariam Board',
    'mariam@shared-kanban.example',
    '+960 7779877',
  );
}

const boards: Board[] = [
  {
    name: 'leads',
    testId: 'leads-kanban-board',
    open: async (page) => {
      await page.goto('/#/leads');
      await page.getByRole('tab', { name: 'Kanban view' }).click();
    },
  },
  {
    name: 'deals',
    testId: 'deals-kanban-board',
    open: async (page) => {
      await page.goto('/#/deals');
      await page.getByRole('tab', { name: 'Pipeline' }).click();
      await expect(page.getByLabel('Sort pipeline deals')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Deals pipeline' })).toHaveCount(0);
      await expect(page.getByText(/Drag a deal to another stage/)).toHaveCount(0);
    },
  },
  {
    name: 'pipelines',
    testId: 'pipelines-board',
    open: async (page) => {
      await page.goto('/#/pipelines');
      await page.getByLabel('Select pipeline').selectOption('');
    },
  },
  {
    name: 'people',
    testId: 'people-board',
    open: async (page) => {
      await page.goto('/#/clients');
      await page.getByRole('tab', { name: 'People' }).click();
      await page.getByRole('tab', { name: 'Board view' }).click();
    },
  },
  {
    name: 'organizations',
    testId: 'clients-kanban-board',
    open: async (page) => {
      await page.goto('/#/clients');
      await page.getByRole('tab', { name: 'Organizations' }).click();
      await page.getByRole('tab', { name: 'Board view' }).click();
    },
  },
  {
    name: 'vendors',
    testId: 'vendors-kanban-board',
    open: async (page) => {
      await page.goto('/#/vendors');
      await page.getByRole('tab', { name: 'Board view' }).click();
    },
  },
];

test('all shared Kanban boards keep identical card and column dimensions at responsive viewports', async ({ page }) => {
  test.setTimeout(180_000);
  const screenshotDirectory = path.resolve('e2e/screenshots');
  mkdirSync(screenshotDirectory, { recursive: true });
  await createBoardFixtures(page);

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    let sharedTypography: Record<string, string> | undefined;

    for (const boardDefinition of boards) {
      await boardDefinition.open(page);
      const board = page.getByTestId(boardDefinition.testId);
      await expect(board, `${boardDefinition.name} board loads at ${viewport.width}x${viewport.height}`).toBeVisible();
      await expect(board.locator('.kanban-card').first()).toBeVisible();

      const metrics = await board.evaluate((element) => {
        const cards = [...element.querySelectorAll<HTMLElement>('.kanban-card')];
        const columns = [...element.querySelectorAll<HTMLElement>('.kanban-column')];
        const headers = columns.map((column) => column.querySelector<HTMLElement>('.kanban-column__header'));
        const firstCard = cards[0];
        const firstPill = firstCard.querySelector<HTMLElement>('.kanban-card__pill-slot > *');
        const title = firstCard.querySelector<HTMLElement>('.kanban-card__title');
        const meta = firstCard.querySelector<HTMLElement>('.kanban-card__meta');
        const footer = firstCard.querySelector<HTMLElement>('.kanban-card__footer');
        const footerRight = firstCard.querySelector<HTMLElement>('.kanban-card__footer-right');
        const columnTitle = headers[0]?.querySelector<HTMLElement>('.kanban-column__name');
        const columnSummary = headers[0]?.querySelector<HTMLElement>('.kanban-column__summary');
        const typography = {
          cardPadding: getComputedStyle(firstCard).padding,
          pillFontSize: firstPill ? getComputedStyle(firstPill).fontSize : '',
          pillFontWeight: firstPill ? getComputedStyle(firstPill).fontWeight : '',
          titleFontSize: title ? getComputedStyle(title).fontSize : '',
          titleFontWeight: title ? getComputedStyle(title).fontWeight : '',
          metaFontSize: meta ? getComputedStyle(meta).fontSize : '',
          metaFontWeight: meta ? getComputedStyle(meta).fontWeight : '',
          footerFontSize: footer ? getComputedStyle(footer).fontSize : '',
          footerRightFontWeight: footerRight ? getComputedStyle(footerRight).fontWeight : '',
          columnTitleFontSize: columnTitle ? getComputedStyle(columnTitle).fontSize : '',
          columnTitleFontWeight: columnTitle ? getComputedStyle(columnTitle).fontWeight : '',
          columnSummaryFontSize: columnSummary ? getComputedStyle(columnSummary).fontSize : '',
        };
        return {
          cards: cards.map((card) => {
            const cardTitle = card.querySelector<HTMLElement>('.kanban-card__title')!;
            const cardPill = card.querySelector<HTMLElement>('.kanban-card__pill-slot > *');
            const cardMeta = card.querySelector<HTMLElement>('.kanban-card__meta')!;
            const cardFooter = card.querySelector<HTMLElement>('.kanban-card__footer')!;
            const cardFooterLeft = card.querySelector<HTMLElement>('.kanban-card__footer-left')!;
            const cardFooterRight = card.querySelector<HTMLElement>('.kanban-card__footer-right')!;
            const bounds = card.getBoundingClientRect();
            const titleBounds = cardTitle.getBoundingClientRect();
            const footerLeftBounds = cardFooterLeft.getBoundingClientRect();
            const footerRightBounds = cardFooterRight.getBoundingClientRect();
            return {
              height: bounds.height,
              padding: getComputedStyle(card).padding,
              pillFontSize: cardPill ? getComputedStyle(cardPill).fontSize : '',
              pillFontWeight: cardPill ? getComputedStyle(cardPill).fontWeight : '',
              titleFontSize: getComputedStyle(cardTitle).fontSize,
              titleFontWeight: getComputedStyle(cardTitle).fontWeight,
              metaFontSize: getComputedStyle(cardMeta).fontSize,
              footerFontSize: getComputedStyle(cardFooter).fontSize,
              footerRightFontWeight: getComputedStyle(cardFooterRight).fontWeight,
              role: card.getAttribute('role'),
              tabIndex: card.tabIndex,
              titleLineClamp: getComputedStyle(cardTitle).webkitLineClamp,
              titleFits: titleBounds.left >= bounds.left && titleBounds.right <= bounds.right
                && cardTitle.scrollHeight <= cardTitle.clientHeight + 1,
              footerLeftFlex: getComputedStyle(cardFooterLeft).flex,
              footerRightFlex: getComputedStyle(cardFooterRight).flex,
              footerRightWhiteSpace: getComputedStyle(cardFooterRight).whiteSpace,
              footerDoesNotOverlap: footerLeftBounds.right <= footerRightBounds.left + 1,
              footerRightFits: footerRightBounds.right <= bounds.right - 12 + 1,
            };
          }),
          columns: columns.map((column) => {
            const bounds = column.getBoundingClientRect();
            return { width: bounds.width, height: bounds.height };
          }),
          boardClientHeight: element.clientHeight,
          headerHeights: headers.map((header) => header?.getBoundingClientRect().height ?? 0),
          headersHaveIcons: headers.some((header) => Boolean(header?.querySelector('svg'))),
          typography,
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
        };
      });

      expect(metrics.cards.length, `${boardDefinition.name} has cards`).toBeGreaterThan(0);
      expect(Math.max(...metrics.cards.map((card) => card.height))
        - Math.min(...metrics.cards.map((card) => card.height)), `${boardDefinition.name} card heights`).toBeLessThanOrEqual(1);
      expect(metrics.cards.every((card) => card.height === 132 && card.padding === '12px'), `${boardDefinition.name} card size and padding`).toBe(true);
      expect(metrics.cards.every((card) => card.pillFontSize === '10px' && card.pillFontWeight === '700'
        && card.titleFontSize === '14px' && card.titleFontWeight === '600'
        && card.metaFontSize === '11px' && card.footerFontSize === '12px'
        && card.footerRightFontWeight === '600'), `${boardDefinition.name} card typography`).toBe(true);
      expect(metrics.cards.every((card) => card.role === 'button' && card.tabIndex === 0), `${boardDefinition.name} cards are keyboard focusable`).toBe(true);
      expect(metrics.cards.every((card) => card.titleLineClamp === '2' && card.titleFits), `${boardDefinition.name} titles clamp within cards`).toBe(true);
      const footerProblems = metrics.cards.filter((card) => card.footerLeftFlex !== '1 1 0px'
        || card.footerRightFlex !== '0 0 auto' || card.footerRightWhiteSpace !== 'nowrap'
        || !card.footerDoesNotOverlap || !card.footerRightFits);
      expect(footerProblems, `${boardDefinition.name} footer values do not overlap or clip`).toEqual([]);
      expect(metrics.columns.every((column) => Math.abs(column.width - 240) <= 1), `${boardDefinition.name} fixed column width`).toBe(true);
      expect(new Set(metrics.columns.map(({ height }) => height)).size, `${boardDefinition.name} columns share a height`).toBe(1);
      expect(metrics.columns.every(({ height }) => Math.abs(height - metrics.boardClientHeight) <= 1),
        `${boardDefinition.name} columns fill the board area`).toBe(true);
      if (boardDefinition.name === 'vendors') {
        expect(metrics.columns).toHaveLength(5);
      }
      if (boardDefinition.name === 'organizations') {
        expect(metrics.columns).toHaveLength(5);
      }
      expect(new Set(metrics.headerHeights).size, `${boardDefinition.name} column header heights`).toBe(1);
      expect(metrics.headerHeights.every((height) => height === 72), `${boardDefinition.name} column header height`).toBe(true);
      expect(metrics.headersHaveIcons, `${boardDefinition.name} column headers have no icons`).toBe(false);
      expect(metrics.documentWidth, `${boardDefinition.name} page-level horizontal overflow`).toBeLessThanOrEqual(metrics.viewportWidth);
      expect(metrics.typography, `${boardDefinition.name} typography at ${viewport.width}x${viewport.height}`).toMatchObject({
        cardPadding: '12px',
        pillFontSize: '10px',
        pillFontWeight: '700',
        titleFontSize: '14px',
        titleFontWeight: '600',
        metaFontSize: '11px',
        metaFontWeight: '400',
        footerFontSize: '12px',
        footerRightFontWeight: '600',
        columnTitleFontSize: '14px',
        columnTitleFontWeight: '600',
        columnSummaryFontSize: '11px',
      });
      if (sharedTypography) {
        expect(metrics.typography, `${boardDefinition.name} matches the shared scale`).toEqual(sharedTypography);
      } else {
        sharedTypography = metrics.typography;
      }

      await page.screenshot({
        path: path.join(screenshotDirectory, `shared-${boardDefinition.name}-${viewport.width}x${viewport.height}.png`),
        fullPage: true,
        animations: 'disabled',
      });
    }
  }

  await page.goto('/#/clients');
  await page.getByRole('tab', { name: 'People' }).click();
  await page.getByRole('tab', { name: 'Board view' }).click();
  const peopleBoard = page.getByTestId('people-board');
  const peopleColumns = peopleBoard.locator('.kanban-column');
  const allPeopleColumnCount = await peopleColumns.count();
  expect(allPeopleColumnCount).toBeGreaterThan(0);
  await page.getByRole('textbox', { name: 'Search people' }).fill('no matching person');
  await expect(peopleBoard.locator('.kanban-card')).toHaveCount(0);
  await expect(peopleColumns).toHaveCount(allPeopleColumnCount);
  await expect(peopleColumns.locator('.kanban-column__empty')).toHaveCount(allPeopleColumnCount);
});

test('mobile Vendors cards use the shared fixed card design', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/vendors');
  await page.getByRole('tab', { name: 'List view' }).click();
  const cards = page.getByTestId('vendors-card-grid').locator('.kanban-card');
  await expect(cards.first()).toBeVisible();
  const cardStyles = await cards.evaluateAll((elements) => elements.map((card) => {
    const title = card.querySelector<HTMLElement>('.kanban-card__title')!;
    const meta = card.querySelector<HTMLElement>('.kanban-card__meta')!;
    const footer = card.querySelector<HTMLElement>('.kanban-card__footer')!;
    const pill = card.querySelector<HTMLElement>('.kanban-card__pill-slot > *')!;
    return {
      height: card.getBoundingClientRect().height,
      padding: getComputedStyle(card).padding,
      titleFontSize: getComputedStyle(title).fontSize,
      metaFontSize: getComputedStyle(meta).fontSize,
      footerFontSize: getComputedStyle(footer).fontSize,
      pillFontSize: getComputedStyle(pill).fontSize,
    };
  }));
  expect(cardStyles.length).toBeGreaterThan(0);
  expect(cardStyles.every((style) => style.height === 132 && style.padding === '12px'
    && style.titleFontSize === '14px' && style.metaFontSize === '11px'
    && style.footerFontSize === '12px' && style.pillFontSize === '10px')).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  mkdirSync(path.resolve('e2e/screenshots'), { recursive: true });
  await page.screenshot({
    path: path.resolve('e2e/screenshots/shared-vendor-cards-390x844.png'),
    fullPage: true,
    animations: 'disabled',
  });
});

test('Vendor and customer group columns remain visible when searches empty them', async ({ page }) => {
  await page.goto('/#/vendors');
  await page.getByRole('tab', { name: 'Board view' }).click();
  const vendorBoard = page.getByTestId('vendors-kanban-board');
  const vendorColumns = vendorBoard.locator('.kanban-column');
  await expect(vendorColumns).toHaveCount(5);
  await page.getByRole('textbox', { name: 'Search vendors' }).fill('no matching vendor');
  await expect(vendorBoard.locator('.kanban-card')).toHaveCount(0);
  await expect(vendorColumns).toHaveCount(5);
  await expect(vendorColumns.locator('.kanban-column__empty')).toHaveCount(5);
  await page.getByLabel('Group vendors by').selectOption('status');
  await expect(vendorColumns).toHaveCount(2);
  await expect(vendorColumns.locator('.kanban-column__empty')).toHaveCount(2);

  await page.goto('/#/clients');
  await page.getByRole('tab', { name: 'Board view' }).click();
  const organizationBoard = page.getByTestId('clients-kanban-board');
  const organizationColumns = organizationBoard.locator('.kanban-column');
  await expect(organizationColumns).toHaveCount(5);
  await page.getByRole('textbox', { name: 'Search organizations' }).fill('no matching organization');
  await expect(organizationBoard.locator('.kanban-card')).toHaveCount(0);
  await expect(organizationColumns).toHaveCount(5);
  await expect(organizationColumns.locator('.kanban-column__empty')).toHaveCount(5);

});
