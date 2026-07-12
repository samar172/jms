const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function refreshAccessToken(): Promise<string | null> {
  const res = await fetch(`${API_URL}/api/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) return null;
  const data = await res.json();
  accessToken = data.accessToken;
  return accessToken;
}

interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  isForm?: boolean;
  skipAuthRetry?: boolean;
}

export async function apiFetch<T = unknown>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { body, isForm, skipAuthRetry, headers, ...rest } = options;

  const doFetch = async (): Promise<Response> =>
    fetch(`${API_URL}${path}`, {
      ...rest,
      credentials: "include",
      headers: {
        ...(isForm ? {} : { "Content-Type": "application/json" }),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : isForm ? (body as BodyInit) : JSON.stringify(body),
    });

  let res = await doFetch();

  if (res.status === 401 && !skipAuthRetry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await doFetch();
    } else {
      onUnauthorized?.();
    }
  }

  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json") ? await res.json() : await res.text();

  if (!res.ok) {
    const message = typeof data === "object" && data && "error" in data ? String(data.error) : "Request failed";
    throw new ApiError(res.status, message, typeof data === "object" ? (data as { details?: unknown }).details : undefined);
  }

  return data as T;
}

export function resolveMediaUrl(url: string | null | undefined): string {
  if (!url) return "";
  return url.startsWith("http") ? url : `${API_URL}${url}`;
}

export { refreshAccessToken, API_URL };
