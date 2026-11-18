import { describe, expect, it } from 'vitest';
import { createDefaultSettingsCatalogs, normalizeSettingsCatalogs } from './settingsCatalogs';

describe('settings catalogs', () => {
  it('provides default lead sources and a USD exchange rate', () => {
    const defaults = createDefaultSettingsCatalogs();

    expect(defaults.leadSources).toEqual(['Referral', 'Website', 'Renewal', 'Walk-in', 'Partner']);
    expect(defaults.exchangeRates).toEqual([{ id: 'usd', currency: 'USD', usdPerUnit: 1 }]);
  });

  it('normalizes saved category records while preserving valid settings', () => {
    const catalogs = normalizeSettingsCatalogs({
      tags: [' Priority ', '', 'Priority'],
      leadSources: [],
      priceBooks: [{
        id: 'book-1',
        name: 'Standard',
        currency: 'USD',
        overrides: [{ productCode: 'AUTO', price: 100 }],
      }],
      payeeAccounts: [{ id: 'payee-1', name: 'Insurer', accountNumber: '12345' }],
      notices: [{ id: 'notice-1', title: 'Update', body: 'Hello', status: 'Published' }],
      strategicGoals: [{ id: 'goal-1', title: 'Growth', horizon: 'Quarterly', target: 10, unit: 'MVR' }],
      exchangeRates: [{ id: 'rate-1', currency: 'MVR', usdPerUnit: 0.06 }],
    });

    expect(catalogs.tags).toEqual(['Priority']);
    expect(catalogs.leadSources).toEqual([]);
    expect(catalogs.priceBooks[0].overrides).toEqual([{ productCode: 'AUTO', price: 100 }]);
    expect(catalogs.notices[0].status).toBe('Published');
    expect(catalogs.strategicGoals[0].horizon).toBe('Quarterly');
    expect(catalogs.exchangeRates).toEqual([{ id: 'rate-1', currency: 'MVR', usdPerUnit: 0.06 }]);
  });

  it('falls back safely when stored category data is malformed', () => {
    const catalogs = normalizeSettingsCatalogs({
      tags: 'not-an-array',
      priceBooks: [{ id: 2, name: null }],
      notices: [{ id: 'bad-notice', title: 'Missing body' }],
    });

    expect(catalogs.tags).toEqual([]);
    expect(catalogs.priceBooks).toEqual([]);
    expect(catalogs.notices).toEqual([]);
    expect(catalogs.exchangeRates).toEqual([{ id: 'usd', currency: 'USD', usdPerUnit: 1 }]);
  });
});
