import { describe, expect, it } from 'vitest';
import { formatShortDate, normalizeDateInput, parseDateInput } from '../date';

describe('date input parsing', () => {
  it('formats compact Kanban dates without the year', () => {
    expect(formatShortDate('2026-12-15')).toBe('15 Dec');
    expect(formatShortDate('invalid')).toBe('');
  });

  it('accepts both displayed date separators and normalizes to ISO', () => {
    expect(parseDateInput('12/Nov/2026')).toBe('2026-11-12');
    expect(parseDateInput('12-Nov-2026')).toBe('2026-11-12');
    expect(normalizeDateInput('12/Nov/2026')).toBe('2026-11-12');
  });

  it('rejects invalid dates and mixed separators', () => {
    expect(parseDateInput('31/Feb/2026')).toBe('');
    expect(parseDateInput('12/Nov-2026')).toBe('');
  });
});
