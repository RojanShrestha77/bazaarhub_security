export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
const CSRF_COOKIE = "__Host-bazaarhub-csrf";

function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${CSRF_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function needsCsrf(method: string): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method);
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  details?: Record<string, string[]>;
  constructor(status: number, body: unknown) {
    const msg = body && typeof body === "object" ? (body as Record<string, unknown>).error as string || (body as Record<string, unknown>).message as string || "Request failed" : "Request failed";
    super(msg);
    this.status = status;
    this.body = body;
    if (body && typeof body === "object") {
      this.details = (body as Record<string, unknown>).details as Record<string, string[]> | undefined;
    }
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, headers = {}, signal } = options;
  const config: RequestInit & { credentials: RequestCredentials } = {
    method,
    headers: { ...headers },
    credentials: "include",
    signal,
  };
  if (body && !(body instanceof FormData)) {
    config.headers = { ...config.headers as Record<string, string>, "Content-Type": "application/json" };
    config.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    config.body = body;
  }
  if (needsCsrf(method)) {
    const token = getCsrfToken();
    if (token) (config.headers as Record<string, string>)["x-csrf-token"] = token;
  }
  const res = await fetch(`${API_BASE}${endpoint}`, config);
  const data: T | null = res.status === 204 || res.status === 205 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export const api = {
  get: <T>(url: string, opts?: RequestOptions) => request<T>(url, { ...opts }),
  post: <T>(url: string, body?: unknown, opts?: RequestOptions) => request<T>(url, { method: "POST", body, ...opts }),
  put: <T>(url: string, body?: unknown, opts?: RequestOptions) => request<T>(url, { method: "PUT", body, ...opts }),
  patch: <T>(url: string, body?: unknown, opts?: RequestOptions) => request<T>(url, { method: "PATCH", body, ...opts }),
  delete: <T>(url: string, opts?: RequestOptions) => request<T>(url, { method: "DELETE", ...opts }),
  upload: <T>(url: string, formData: FormData, opts?: RequestOptions) => request<T>(url, { method: "POST", body: formData, ...opts }),
};
