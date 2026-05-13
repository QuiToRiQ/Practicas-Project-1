/**
 * Centralised fetch wrapper. Uses cookie-based auth (set httpOnly by the
 * backend), so there's never a JWT sitting in localStorage. On 401 we attempt
 * a single refresh and replay the original call once.
 */

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly body: unknown, message: string) {
    super(message);
  }
}

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Set false to opt out of the 401 retry-after-refresh dance. */
  retryOn401?: boolean;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { body, retryOn401 = true, headers, ...rest } = opts;
  const isForm = body instanceof FormData;

  const init: RequestInit = {
    credentials: 'include',
    ...rest,
    headers: {
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...(headers ?? {}),
    },
    body: body == null ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  };

  let res = await fetch(`${API_BASE}${path}`, init);
  if (res.status === 401 && retryOn401 && path !== '/auth/refresh' && path !== '/auth/login') {
    if (await tryRefresh()) res = await fetch(`${API_BASE}${path}`, init);
  }

  if (res.status === 204) return undefined as T;

  const ct = res.headers.get('content-type') ?? '';
  const payload = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = (payload && typeof payload === 'object' && 'message' in payload)
      ? String((payload as { message: unknown }).message)
      : res.statusText;
    throw new ApiError(res.status, payload, msg);
  }
  return payload as T;
}

export async function requestBlob(path: string): Promise<{ blob: Blob; filename: string }> {
  let res = await fetch(`${API_BASE}${path}`, { credentials: 'include' });
  if (res.status === 401 && await tryRefresh()) {
    res = await fetch(`${API_BASE}${path}`, { credentials: 'include' });
  }
  if (!res.ok) throw new ApiError(res.status, null, res.statusText);
  const disp = res.headers.get('content-disposition') ?? '';
  const match = /filename="([^"]+)"/.exec(disp);
  return { blob: await res.blob(), filename: match?.[1] ?? 'export' };
}
