import { describe, expect, it } from 'vitest';
import { SupabaseRetryError, withSupabaseRetry } from './supabaseRetry';

describe('Supabase retry', () => {
  it('retries transient response errors with exponential backoff', async () => {
    let attempts = 0;
    const delays: number[] = [];
    const result = await withSupabaseRetry('Save records', async () => {
      attempts += 1;
      return attempts < 4
        ? { data: null, error: { status: 504, message: 'Gateway Timeout' } }
        : { data: 'saved', error: null };
    }, { wait: async (delayMs) => { delays.push(delayMs); } });

    expect(result.data).toBe('saved');
    expect(attempts).toBe(4);
    expect(delays).toEqual([500, 1000, 2000]);
  });

  it('does not retry non-transient errors', async () => {
    let attempts = 0;
    await expect(withSupabaseRetry('Load records', async () => {
      attempts += 1;
      return { data: null, error: { status: 403, message: 'Forbidden' } };
    }, { wait: async () => {} })).rejects.toMatchObject({
      name: 'SupabaseRetryError',
      message: expect.stringContaining('failed after 1 attempt'),
    } satisfies Partial<SupabaseRetryError>);
    expect(attempts).toBe(1);
  });

  it('retries transient thrown network errors and reports the final failure', async () => {
    let attempts = 0;
    await expect(withSupabaseRetry('Save deals', async () => {
      attempts += 1;
      throw new TypeError('Failed to fetch');
    }, { wait: async () => {} })).rejects.toThrow('Save deals failed after 4 attempts: Failed to fetch');
    expect(attempts).toBe(4);
  });
});
