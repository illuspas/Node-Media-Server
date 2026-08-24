/**
 * REST API client for the NMS admin API (`/api/v1`, same origin).
 * Implements the username/password login defined in docs/api.md
 * and attaches the JWT token to subsequent requests.
 */
import { t } from "../i18n";

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

/* ---------------- login ---------------- */

/** Translate known server messages; fall back to the original text. */
function friendlyMessage(message: string): string {
  const map: Record<string, string> = {
    "Invalid username or password": "api.err.invalidCredentials",
    "Too many failed login attempts, please try again later": "api.err.accountLocked",
    "Too many login requests, please try again later": "api.err.loginRateLimited",
    "Username and password are required": "api.err.credentialsRequired",
    "JWT configuration not found": "api.err.noJwt",
    "oldPassword and newPassword are required": "api.err.pwdRequired",
    "New password must be at least 6 characters": "api.err.pwdTooShort",
    "Old password is incorrect": "api.err.pwdOldIncorrect",
    "New password must be different from the old one": "api.err.pwdSame",
    "Current user not found": "api.err.pwdUserNotFound"
  };
  const id = map[message];
  return id ? t(id) : message;
}

/**
 * Perform a username/password login.
 * @param username - configured admin username
 * @param password - plaintext password
 * @returns the JWT token and the confirmed username
 */
export async function login(username: string, password: string): Promise<{ token: string; username: string }> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
  } catch {
    throw new ApiError(t("api.err.cannotConnect"), 0);
  }
  const body: ApiResponse<{ token: string; user: { username: string } }> = await res.json().catch(() => ({
    success: false,
    data: null as never,
    message: res.statusText
  }));
  if (!res.ok || !body.success) {
    throw new ApiError(friendlyMessage(body.message || t("api.err.loginFailed")), res.status);
  }
  return { token: body.data.token, username: body.data.user.username };
}

/**
 * Change the password of the logged-in user (see docs/api.md POST /api/v1/password).
 * After success the caller should clear the session and return to the login page.
 * @param oldPassword - the current password
 * @param newPassword - the new password (≥ 6 chars, different from the old one)
 */
export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  try {
    await apiFetch("/password", {
      method: "POST",
      body: JSON.stringify({ oldPassword, newPassword })
    });
  } catch (error) {
    // Surface validation errors (wrong old password etc.) localized; leave the
    // 401 session-expiry path untouched so it keeps its global handling.
    if (error instanceof ApiError && error.status !== 401) {
      throw new ApiError(friendlyMessage(error.message), error.status);
    }
    throw error;
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
    throw new ApiError(t("api.err.offline"), 0);
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
    throw new ApiError(t("api.err.unauthorized"), 401);
  }

  if (!res.ok || !body.success) {
    throw new ApiError(body.message || body.error || t("api.err.requestFailed", { status: res.status }), res.status);
  }
  return body.data;
}

/* ---------------- streams & sessions ---------------- */

export interface ApiPublisher {
  id: string;
  ip: string;
  protocol: string;
  createTime: number;
  /** FLV codec id (7 = H.264) or enhanced-RTMP fourcc ("hvc1", "av01", "vp09"). */
  videoCodec: number | string;
  videoWidth: number;
  videoHeight: number;
  videoFramerate: number;
  audioCodec: number | string;
  audioChannels: number;
  audioSamplerate: number;
  /** Cumulative bytes received from the publisher. */
  inBytes: number;
}

/** Real publish state; "reconnecting" = publisher dropped, held for the grace window. */
export type StreamStatus = "publishing" | "reconnecting" | "idle";

export interface ApiStream {
  key: string;
  app: string;
  name: string;
  status: StreamStatus;
  publisher: ApiPublisher | null;
  subscribers: number;
}

/** List all active streams (see docs/api.md GET /api/v1/streams). */
export function fetchStreams(): Promise<ApiStream[]> {
  return apiFetch<{ streams: ApiStream[]; total: number }>("/streams").then(d => d.streams ?? []);
}

/** Terminate a session by id (see docs/api.md DELETE /api/v1/sessions/{id}). */
export function deleteSession(id: string): Promise<void> {
  return apiFetch(`/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }).then(() => undefined);
}

/* ---------------- relay ---------------- */

export interface RelayTrack {
  type: string;
  codec: string;
  payloadType: number;
  clockRate: number;
}

/** Task status as returned by GET /api/v1/relay (taskKey present when listed). */
export interface ApiRelayTask {
  taskKey?: string;
  id: string;
  /** "rtsp" | "rtmp" */
  protocol: string;
  /** RTMP tasks only; RTSP is always pull. */
  mode?: "pull" | "push";
  /** Remote URL (rtsp tasks expose it as rtspUrl instead). */
  url?: string;
  rtspUrl?: string;
  streamPath: string;
  isRunning: boolean;
  isClosing: boolean;
  reconnectAttempts: number;
  inBytes: number;
  outBytes: number;
  createTime: number;
  endTime: number;
  tracks?: RelayTrack[];
}

export interface RelayTaskInput {
  url: string;
  mode: "pull" | "push";
  streamPath: string;
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

/** List all relay tasks (see docs/api.md GET /api/v1/relay). */
export function fetchRelayTasks(): Promise<ApiRelayTask[]> {
  return apiFetch<ApiRelayTask[]>("/relay");
}

/** Create a relay task (see docs/api.md POST /api/v1/relay). */
export function addRelayTask(input: RelayTaskInput): Promise<ApiRelayTask> {
  return apiFetch<ApiRelayTask>("/relay", { method: "POST", body: JSON.stringify(input) });
}

/** Remove a relay task by its taskKey (see docs/api.md DELETE /api/v1/relay). */
export function removeRelayTask(taskKey: string): Promise<void> {
  return apiFetch("/relay", { method: "DELETE", body: JSON.stringify({ taskKey }) }).then(() => undefined);
}

/* ---------------- records ---------------- */

/** Recording metadata persisted by the record server (GET /api/v1/records). */
export interface ApiRecord {
  id: string;
  streamPath: string;
  app: string;
  name: string;
  filePath: string;
  /** Publisher session id, usable with DELETE /api/v1/sessions/{id} to stop recording. */
  publisherId?: string;
  startTime: number;
  endTime: number;
  /** Milliseconds. */
  duration: number;
  /** Bytes written. */
  size: number;
  status: "recording" | "done";
}

export interface RecordsPage {
  items: ApiRecord[];
  count: number;
  page: number;
  pageSize: number;
  totalDuration: number;
  totalSize: number;
}

export interface RecordsQuery {
  streamPath?: string;
  /** Substring match across streamPath and name. */
  search?: string;
  status?: "recording" | "done";
  /** Inclusive start bound on startTime, as ms since epoch. */
  start?: number;
  /** Inclusive end bound on startTime, as ms since epoch. */
  end?: number;
  page?: number;
  pageSize?: number;
}

/** List recordings, newest first (see GET /api/v1/records). */
export function fetchRecords(query: RecordsQuery = {}): Promise<RecordsPage> {
  const qs = new URLSearchParams();
  if (query.streamPath) qs.set("streamPath", query.streamPath);
  if (query.search) qs.set("search", query.search);
  if (query.status) qs.set("status", query.status);
  if (query.start !== undefined) qs.set("start", String(query.start));
  if (query.end !== undefined) qs.set("end", String(query.end));
  qs.set("page", String(query.page ?? 1));
  qs.set("pageSize", String(query.pageSize ?? 20));
  return apiFetch<RecordsPage>(`/records?${qs.toString()}`);
}

/** Delete a recording entry; also deletes the flv file when file=true. */
export function deleteRecord(id: string, file = false): Promise<void> {
  return apiFetch(`/records/${encodeURIComponent(id)}${file ? "?file=true" : ""}`, {
    method: "DELETE"
  }).then(() => undefined);
}

/**
 * Download the flv file of a finished recording; the browser save dialog
 * is triggered via a temporary object URL so the JWT header still applies.
 */
export async function downloadRecord(id: string, fileName: string): Promise<void> {
  const headers = new Headers();
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/records/${encodeURIComponent(id)}/download`, { headers });
  } catch {
    throw new ApiError(t("api.err.offline"), 0);
  }
  if (res.status === 401) {
    clearSession();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw new ApiError(t("api.err.unauthorized"), 401);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(body?.error || body?.message || t("api.err.requestFailed", { status: res.status }), res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------------- history ---------------- */

export interface ApiHistoryEntry {
  id: string;
  protocol: string;
  streamPath: string;
  app: string;
  name: string;
  ip: string;
  startTime: number;
  endTime: number;
  duration: number;
  inBytes: number;
  outBytes: number;
  /** Cumulative play count for this stream path, snapshotted at publish end. */
  playCount: number;
}

export interface HistoryPage {
  items: ApiHistoryEntry[];
  count: number;
  page: number;
  pageSize: number;
}

/** List persisted publish history (see GET /api/v1/history). */
export function fetchHistory(query: {
  streamPath?: string;
  ip?: string;
  protocol?: string;
  search?: string;
  /** Inclusive start bound on startTime, as ms since epoch. */
  start?: number;
  /** Inclusive end bound on startTime, as ms since epoch. */
  end?: number;
  page?: number;
  pageSize?: number;
} = {}): Promise<HistoryPage> {
  const qs = new URLSearchParams();
  if (query.streamPath) qs.set("streamPath", query.streamPath);
  if (query.ip) qs.set("ip", query.ip);
  if (query.protocol) qs.set("protocol", query.protocol);
  if (query.search) qs.set("search", query.search);
  if (query.start !== undefined) qs.set("start", String(query.start));
  if (query.end !== undefined) qs.set("end", String(query.end));
  qs.set("page", String(query.page ?? 1));
  qs.set("pageSize", String(query.pageSize ?? 20));
  return apiFetch<HistoryPage>(`/history?${qs.toString()}`);
}

/**
 * Clear history; also resets the affected play counters.
 * Without a streamPath the whole history is cleared.
 */
export function deleteHistory(streamPath?: string): Promise<void> {
  const qs = streamPath ? `?streamPath=${encodeURIComponent(streamPath)}` : "";
  return apiFetch(`/history${qs}`, { method: "DELETE" }).then(() => undefined);
}

/* ---------------- config ---------------- */

/** Editable server configuration (GET /api/v1/config). */
export interface ApiConfig {
  bind?: string;
  notify?: { url?: string };
  store?: { path?: string; maxHistory?: number };
  record?: { path?: string };
  auth?: { play?: boolean; publish?: boolean; secret?: string };
  rtmp?: { port?: number };
  rtmps?: { port?: number; key?: string; cert?: string };
  http?: { port?: number };
  https?: { port?: number; key?: string; cert?: string };
}

/** Read the current configuration (see docs/api.md GET /api/v1/config). */
export function fetchConfig(): Promise<ApiConfig> {
  return apiFetch<ApiConfig>("/config");
}

/**
 * Update configuration fields and persist them to config.json.
 * Port / path changes only take effect after a server restart.
 */
export function updateConfig(patch: ApiConfig): Promise<void> {
  return apiFetch("/config", { method: "PUT", body: JSON.stringify(patch) }).then(() => undefined);
}

/* ---------------- stats ---------------- */

export interface ApiStats {
  server: {
    /** Process uptime in seconds. */
    uptime: number;
    nodeVersion: string;
    platform: string;
    arch: string;
    pid: number;
  };
  /** process.cpuUsage() — cumulative microseconds since process start. */
  cpu: { user: number; system: number };
  /** process.memoryUsage() — bytes. */
  memory: { rss: number; heapTotal: number; heapUsed: number; external?: number; arrayBuffers?: number };
  sessions: { total: number; publishers: number; players: number };
  /** Cumulative streaming traffic (bytes) over the process lifetime. */
  network: { inBytes: number; outBytes: number };
  timestamp: string;
}

/** Server runtime statistics (see docs/api.md GET /api/v1/stats). */
export function fetchStats(): Promise<ApiStats> {
  return apiFetch<ApiStats>("/stats");
}
