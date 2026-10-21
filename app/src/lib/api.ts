import { Platform } from 'react-native';
import { getToken } from './storage';

/**
 * Website: same server as the page ('' = /api on this domain).
 * Android app / local development: EXPO_PUBLIC_API_URL, e.g. https://prasadshoes.in
 */
const ENV_URL = process.env.EXPO_PUBLIC_API_URL ?? '';
// Website: same server as the page in production (Nginx). In development the .env address is for the
// Android emulator (10.0.2.2 = this PC), so the browser uses this PC's own name (localhost) instead.
export const API_URL = (
  Platform.OS === 'web' ? (__DEV__ ? ENV_URL.replace('10.0.2.2', globalThis.location?.hostname || 'localhost') : '') : ENV_URL
).replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: Record<string, string> = {},
    public extra: Record<string, any> = {},
  ) {
    super(message);
  }
}

type Listener = (e: ApiError) => void;
let onAuthError: Listener = () => {};
/** The auth provider registers here to log out on 401 and send people to Change password on 403. */
export function setAuthErrorListener(l: Listener) {
  onAuthError = l;
}

async function request(method: string, path: string, body?: unknown, timeoutMs = 20_000): Promise<Response> {
  const token = await getToken();
  let res: Response;
  // Never spin forever: give up after timeoutMs and show a clear message.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method,
      signal: ctrl.signal,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', `Server not reachable (${API_URL || 'same website'}). Check the internet and that the server is running.`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let data: any = {};
    try {
      data = await res.json();
    } catch {}
    const e = data?.error ?? {};
    const { code, message, fields, ...extra } = e;
    const err = new ApiError(res.status, code ?? 'SERVER', message ?? `Server error (${res.status})`, fields ?? {}, extra);
    if (res.status === 401 || code === 'PASSWORD_CHANGE_REQUIRED') {
      if (!path.startsWith('/auth/login')) onAuthError(err);
    }
    throw err;
  }
  return res;
}

export async function api<T = any>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const res = await request(method, path, body);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** For the Word file: returns raw bytes plus the file name and page count from the headers. */
export async function apiFile(method: 'GET' | 'POST', path: string, body?: unknown) {
  const res = await request(method, path, body, 180_000); // big Word files can take longer
  const disp = res.headers.get('content-disposition') ?? '';
  const name = res.headers.get('x-file-name') ?? disp.match(/filename="?([^";]+)"?/)?.[1] ?? 'labels.docx';
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { name, bytes, pages: Number(res.headers.get('x-page-count') ?? 0) };
}
