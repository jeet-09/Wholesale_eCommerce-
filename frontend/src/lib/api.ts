import { useAuthStore } from './auth-store';
import type { AuthResponse, ErrorEnvelope, PaginationMeta, SuccessEnvelope } from './types';

const API_ROOT = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const API_BASE = `${API_ROOT}/api/v1`;

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export type QueryValue = string | number | boolean | undefined | null;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, QueryValue>;
  idempotencyKey?: string;
  /** Internal: prevents infinite refresh loops. */
  _isRetry?: boolean;
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(`${API_BASE}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

// Single-flight refresh so concurrent 401s don't trigger a refresh storm.
let refreshPromise: Promise<boolean> | null = null;

async function attemptRefresh(): Promise<boolean> {
  refreshPromise ??= (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return false;
      const json = (await res.json()) as SuccessEnvelope<AuthResponse>;
      useAuthStore.getState().setSession({
        accessToken: json.data.accessToken,
        user: json.data.user,
        context: json.data.context,
      });
      return true;
    } catch {
      return false;
    } finally {
      // Allow subsequent refreshes after this attempt resolves.
      setTimeout(() => {
        refreshPromise = null;
      }, 0);
    }
  })();
  return refreshPromise;
}

async function rawRequest(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {};
  // Only declare a JSON body when one is actually sent. Fastify rejects requests
  // that advertise `application/json` but have an empty body (e.g. DELETE).
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = useAuthStore.getState().accessToken;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  return fetch(buildUrl(path, options.query), {
    method: options.method ?? 'GET',
    headers,
    credentials: 'include',
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

async function parseError(res: Response): Promise<never> {
  let code = 'HTTP_ERROR';
  let message = res.statusText || 'Request failed';
  let details: unknown;
  try {
    const json = (await res.json()) as ErrorEnvelope;
    if (json && json.error) {
      code = json.error.code ?? code;
      message = json.error.message ?? message;
      details = json.error.details;
    }
  } catch {
    // Non-JSON error body; keep defaults.
  }
  throw new ApiError(res.status, code, message, details);
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  let res = await rawRequest(path, options);

  // Try a one-time refresh on 401 (expired access token), then retry.
  if (res.status === 401 && !options._isRetry && !path.startsWith('/auth/')) {
    const refreshed = await attemptRefresh();
    if (refreshed) {
      res = await rawRequest(path, { ...options, _isRetry: true });
    } else {
      useAuthStore.getState().clear();
    }
  }

  if (!res.ok) await parseError(res);
  return res;
}

/** Performs a request and returns the unwrapped `data` payload. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await send(path, options);
  if (res.status === 204) return undefined as T;
  const json = (await res.json()) as SuccessEnvelope<T>;
  return json.data;
}

const EMPTY_PAGINATION: PaginationMeta = {
  page: 1,
  pageSize: 0,
  totalItems: 0,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false,
};

/** Performs a request and returns both the list and pagination metadata. */
export async function apiRequestPaginated<T>(
  path: string,
  options: RequestOptions = {},
): Promise<{ data: T[]; pagination: PaginationMeta }> {
  const res = await send(path, options);
  const json = (await res.json()) as SuccessEnvelope<T[]>;
  return { data: json.data, pagination: json.meta.pagination ?? EMPTY_PAGINATION };
}

export { API_BASE, API_ROOT };
