interface SupabaseResult {
  error: unknown;
}

export interface SupabaseRetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  wait?: (delayMs: number) => Promise<void>;
}

export class SupabaseRetryError extends Error {
  constructor(
    operation: string,
    attempts: number,
    readonly originalError: unknown,
  ) {
    super(`${operation} failed after ${attempts} attempt${attempts === 1 ? '' : 's'}: ${getErrorMessage(originalError)}`);
    this.name = 'SupabaseRetryError';
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return String(error);
}

export function isRetryableSupabaseError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const details = error as {
    status?: unknown;
    code?: unknown;
    name?: unknown;
    message?: unknown;
    context?: { status?: unknown } | null;
  };
  const statuses = [details.status, details.context?.status];
  if (statuses.some((status) =>
    typeof status === 'number' && (status === 408 || status === 425 || status === 429 || status >= 500))) {
    return true;
  }

  const description = [details.name, details.code, details.message]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  return /timeout|timed out|gateway timeout|\b5\d\d\b|network|failed to fetch|fetch failed|connection reset|connection refused|socket hang up|econnreset|etimedout|eai_again|aborterror/.test(description);
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export async function withSupabaseRetry<T extends SupabaseResult>(
  operation: string,
  request: () => PromiseLike<T>,
  options: SupabaseRetryOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 4);
  const initialDelayMs = Math.max(0, options.initialDelayMs ?? 500);
  const maxDelayMs = Math.max(initialDelayMs, options.maxDelayMs ?? 4000);
  const wait = options.wait ?? delay;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await request();
      if (!result.error) return result;
      lastError = result.error;
    } catch (error) {
      lastError = error;
    }

    if (!isRetryableSupabaseError(lastError) || attempt === maxAttempts) {
      throw new SupabaseRetryError(operation, attempt, lastError);
    }

    await wait(Math.min(initialDelayMs * 2 ** (attempt - 1), maxDelayMs));
  }

  throw new SupabaseRetryError(operation, maxAttempts, lastError);
}
