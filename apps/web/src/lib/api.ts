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

// Plain <a href> can't carry the access token (it only ever lives in this
// module's in-memory variable, never a cookie), so any authenticated
// download/preview route needs to go through fetch instead. Opens a blank
// tab synchronously (inside the click handler's call stack) so the browser
// doesn't treat the later async navigation as a blocked popup.
export async function openAuthenticated(path: string): Promise<void> {
  const newTab = window.open("", "_blank");
  const doFetch = async (): Promise<Response> =>
    fetch(`${API_URL}${path}`, {
      credentials: "include",
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
  try {
    let res = await doFetch();
    if (res.status === 401) {
      const refreshed = await refreshAccessToken();
      if (refreshed) res = await doFetch();
    }
    if (!res.ok) {
      newTab?.close();
      const data = await res.json().catch(() => null);
      throw new ApiError(res.status, (data && "error" in data && String(data.error)) || "Failed to open file");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    if (newTab) {
      newTab.location.href = url;
    } else {
      window.open(url, "_blank");
    }
  } catch (err) {
    newTab?.close();
    throw err;
  }
}

export { refreshAccessToken, API_URL };
