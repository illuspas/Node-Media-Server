/**
 * REST API client for the NMS admin API (`/api/v1`, same origin).
 * Implements the two-step challenge-response login defined in docs/api.md
 * and attaches the JWT token to subsequent requests.
 */

const API_BASE = "/api/v1";
const TOKEN_KEY = "nms_token";
const USER_KEY = "nms_username";

/** Window event fired when the API rejects an expired/invalid token. */
export const UNAUTHORIZED_EVENT = "nms:unauthorized";

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/* ---------------- session storage ---------------- */

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUsername(): string | null {
  return localStorage.getItem(USER_KEY);
}

export function saveSession(token: string, username: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, username);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/* ---------------- challenge-response login ---------------- */

/** Compute HMAC-SHA256(password, challenge) as a hex digest via WebCrypto. */
async function hmacSha256Hex(password: string, challenge: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(challenge));
  return Array.from(new Uint8Array(signature))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Translate known server messages; fall back to the original text. */
function friendlyMessage(message: string): string {
  const map: Record<string, string> = {
    "Invalid username or password": "用户名或密码错误",
    "Invalid or expired challenge": "登录质询已失效，请重试",
    "Challenge expired": "登录质询已过期，请重试",
    "Username is required": "请输入用户名",
    "Challenge and response are required": "登录质询校验失败，请重试",
    "JWT configuration not found": "服务端未配置认证信息"
  };
  return map[message] ?? message;
}

/**
 * Perform the two-step challenge-response login.
 * @param username - configured admin username
 * @param password - plaintext password, used only as a local HMAC key
 * @returns the JWT token and the confirmed username
 */
export async function login(username: string, password: string): Promise<{ token: string; username: string }> {
  let challenge: string;
  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username })
    });
    const body: ApiResponse<{ challenge: string }> = await res.json();
    if (!res.ok || !body.success) {
      throw new ApiError(friendlyMessage(body.message || "无法获取登录质询"), res.status);
    }
    challenge = body.data.challenge;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("无法连接服务器，请确认媒体服务已启动", 0);
  }

  const response = await hmacSha256Hex(password, challenge);

  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, challenge, response })
    });
    const body: ApiResponse<{ token: string; user: { username: string } }> = await res.json();
    if (!res.ok || !body.success) {
      throw new ApiError(friendlyMessage(body.message || "登录失败"), res.status);
    }
    return { token: body.data.token, username: body.data.user.username };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("登录请求中断，请重试", 0);
  }
}

/* ---------------- authenticated requests ---------------- */

/**
 * Fetch an API endpoint with the JWT token attached and unwrap `data`.
 * On 401 the session is cleared and {@link UNAUTHORIZED_EVENT} is dispatched
 * so the app can switch back to the login page.
 * @param path - path under /api/v1, e.g. "/streams"
 * @param init - extra fetch options; JSON body and headers are merged automatically
 * @returns the `data` field of the response
 */
export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError("无法连接服务器", 0);
  }

  const body: ApiResponse<T> = await res.json().catch(() => ({
    success: false,
    data: null as T,
    message: res.statusText
  }));

  if (res.status === 401) {
    clearSession();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw new ApiError("登录已过期，请重新登录", 401);
  }

  if (!res.ok || !body.success) {
    throw new ApiError(body.message || body.error || `请求失败 (${res.status})`, res.status);
  }
  return body.data;
}
