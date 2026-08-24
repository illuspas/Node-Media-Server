import { useCallback, useEffect, useState } from "react";
import { useIntl } from "react-intl";
import Icon from "../components/Icon";
import { fetchRelayTasks, addRelayTask, removeRelayTask } from "../lib/api";
import type { ApiRelayTask, RelayTaskInput } from "../lib/api";
import { fmtBytes, fmtDur } from "../lib/format";
import { toast } from "../lib/toast";
import { t } from "../i18n";

const POLL_INTERVAL = 5000;

interface RelayForm {
  mode: "push" | "pull";
  url: string;
  streamPath: string;
  reconnect: boolean;
  reconnectInterval: string;
  maxReconnectAttempts: string;
}

const EMPTY_FORM: RelayForm = {
  mode: "push",
  url: "",
  streamPath: "",
  reconnect: true,
  reconnectInterval: "",
  maxReconnectAttempts: ""
};

/** Mirror the server-side validation in src/api/handlers/relay.js.
 *  Returns a message id for the first problem found, or null when valid. */
function validateForm(form: RelayForm): string | null {
  if (!form.url.trim()) return "relay.validate.urlRequired";
  let parsed: URL;
  try {
    parsed = new URL(form.url.trim());
  } catch {
    return "relay.validate.urlInvalid";
  }
  if (parsed.protocol !== "rtsp:" && parsed.protocol !== "rtmp:") return "relay.validate.scheme";
  if (form.mode === "push" && parsed.protocol !== "rtmp:") return "relay.validate.pushRtmpOnly";
  if (!form.streamPath.trim()) return "relay.validate.pathRequired";
  if (!form.streamPath.trim().startsWith("/")) return "relay.validate.pathSlash";
  return null;
}

function taskMode(t: ApiRelayTask): "push" | "pull" {
  return t.mode ?? "pull";
}

function taskUrl(t: ApiRelayTask): string {
  return t.url ?? t.rtspUrl ?? "—";
}

/** Endpoint of the relay direction: pull = remote source, push = remote target. */
function taskDuration(t: ApiRelayTask, now: number): number {
  const end = t.endTime && !t.isRunning ? t.endTime : now;
  return Math.max(0, (end - t.createTime) / 1000);
}

export default function Relay() {
  const { formatMessage } = useIntl();
  const [tasks, setTasks] = useState<ApiRelayTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(() => Date.now());
  const [form, setForm] = useState<RelayForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setTasks(await fetchRelayTasks());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("relay.errLoad"));
    } finally {
      setLoading(false);
    }
  }, []);

  /* poll the API, paused while the tab is hidden; a 1s tick keeps durations fresh */
  useEffect(() => {
    // Fetch-on-mount is a legitimate external-system sync; every setState in
    // load() runs after the awaited response, never synchronously.
    // oxlint-disable-next-line react/set-state-in-effect
    void load(true);
    const poll = setInterval(() => {
      if (!document.hidden) load(true);
    }, POLL_INTERVAL);
    const clock = setInterval(() => setTick(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateForm(form);
    if (problem) {
      toast(formatMessage({ id: problem }), "warning");
      return;
    }
    setSubmitting(true);
    const interval = Number(form.reconnectInterval);
    const maxAttempts = Number(form.maxReconnectAttempts);
    const input: RelayTaskInput = {
      url: form.url.trim(),
      mode: form.mode,
      streamPath: form.streamPath.trim(),
      reconnect: form.reconnect,
      ...(form.reconnect && Number.isFinite(interval) && interval > 0 ? { reconnectInterval: interval } : {}),
      ...(form.reconnect && Number.isFinite(maxAttempts) && maxAttempts > 0 ? { maxReconnectAttempts: maxAttempts } : {})
    };
    try {
      await addRelayTask(input);
      toast(formatMessage({ id: "relay.toastCreated" }, { path: input.streamPath }));
      setForm(f => ({ ...EMPTY_FORM, mode: f.mode }));
      await load(true);
    } catch (err) {
      toast(err instanceof Error ? err.message : t("relay.toastCreateFailed"), "danger");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (task: ApiRelayTask) => {
    const key = task.taskKey;
    if (!key || deleting) return;
    setDeleting(key);
    try {
      await removeRelayTask(key);
      toast(formatMessage({ id: "relay.toastDeleted" }, { path: task.streamPath }), "danger");
      await load(true);
    } catch (err) {
      toast(err instanceof Error ? err.message : t("relay.toastDeleteFailed"), "danger");
    } finally {
      setDeleting(null);
    }
  };

  // reconnectAttempts reset to 0 on every successful connect, so a non-zero
  // value means the task is in a reconnect cycle right now.
  const running = tasks.filter(task => task.isRunning && task.reconnectAttempts === 0).length;
  const totalBytes = tasks.reduce((a, task) => a + task.inBytes + task.outBytes, 0);

  const urlLabel = formatMessage({ id: form.mode === "push" ? "relay.urlLabelPush" : "relay.urlLabelPull" });
  const urlPlaceholder = form.mode === "push" ? "rtmp://cdn.example.com/live/key" : "rtsp://camera.example.com:554/stream";

  return (
    <main className="p-4 md:p-6 max-w-[1440px] mx-auto space-y-4 md:space-y-6">
      {/* header */}
      <div>
        <h1 className="text-xl md:text-2xl font-semibold tracking-tight">{formatMessage({ id: "nav.relay" })}</h1>
        <p className="text-sm text-stone-500 mt-1">{formatMessage({ id: "relay.subtitle" })}</p>
      </div>

      {/* error banner */}
      {error && (
        <div className="card flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-red-200 bg-red-50">
          <div className="flex items-center gap-2 text-sm text-red-700">
            <Icon name="alert-circle" className="w-4 h-4 shrink-0" />
            {formatMessage({ id: "relay.errBanner" }, { error })}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => load()}>
            {formatMessage({ id: "common.retry" })}
          </button>
        </div>
      )}

      {/* stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-stone-500">{formatMessage({ id: "relay.statRunning" })}</p>
            <p className="text-2xl font-semibold tabular-nums mt-0.5">{running}</p>
          </div>
          <span className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <Icon name="zap" className="w-4 h-4" />
          </span>
        </div>
        <div className="card px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-stone-500">{formatMessage({ id: "relay.statTotal" })}</p>
            <p className="text-2xl font-semibold tabular-nums mt-0.5">{tasks.length}</p>
          </div>
          <span className="w-9 h-9 rounded-lg bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-600">
            <Icon name="layers" className="w-4 h-4" />
          </span>
        </div>
        <div className="card px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-stone-500">{formatMessage({ id: "relay.statTraffic" })}</p>
            <p className="text-2xl font-semibold tabular-nums mt-0.5">{fmtBytes(totalBytes)}</p>
          </div>
          <span className="w-9 h-9 rounded-lg bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-600">
            <Icon name="database" className="w-4 h-4" />
          </span>
        </div>
      </div>

      <div className="grid gap-4 md:gap-6 lg:grid-cols-3 items-start">
        {/* create form */}
        <form className="card p-5 lg:sticky lg:top-20" onSubmit={submit}>
          <h3 className="font-semibold">{formatMessage({ id: "relay.createTitle" })}</h3>
          <p className="text-xs text-stone-500 mt-0.5 mb-5">{formatMessage({ id: "relay.createSubtitle" })}</p>

          <div className="mb-4">
            <label className="label">{formatMessage({ id: "relay.taskType" })}</label>
            <div className="seg w-full">
              <button
                type="button"
                className={`seg-btn flex-1 justify-center ${form.mode === "push" ? "active" : ""}`}
                onClick={() => setForm(f => ({ ...f, mode: "push" }))}
              >
                <Icon name="corner-up-right" className="w-3.5 h-3.5" />
                {formatMessage({ id: "relay.push" })}
              </button>
              <button
                type="button"
                className={`seg-btn flex-1 justify-center ${form.mode === "pull" ? "active" : ""}`}
                onClick={() => setForm(f => ({ ...f, mode: "pull" }))}
              >
                <Icon name="corner-down-left" className="w-3.5 h-3.5" />
                {formatMessage({ id: "relay.pull" })}
              </button>
            </div>
          </div>

          <div className="mb-4">
            <label className="label" htmlFor="r-url">{urlLabel}</label>
            <input
              id="r-url"
              className="input font-mono text-xs"
              placeholder={urlPlaceholder}
              value={form.url}
              onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
            />
            <p className="help">
              {formatMessage({ id: form.mode === "push" ? "relay.helpPush" : "relay.helpPull" })}
            </p>
          </div>

          <div className="mb-2">
            <label className="label" htmlFor="r-path">{formatMessage({ id: "relay.localPath" })}</label>
            <input
              id="r-path"
              className="input font-mono text-xs"
              placeholder="/live/camera1"
              value={form.streamPath}
              onChange={e => setForm(f => ({ ...f, streamPath: e.target.value }))}
            />
            <p className="help">{formatMessage({ id: "relay.localPathHelp" })}</p>
          </div>

          <details className="mb-4 group">
            <summary className="text-[13px] font-medium text-stone-600 cursor-pointer select-none flex items-center gap-1.5 py-2">
              <Icon name="sliders" className="w-3.5 h-3.5" />
              {formatMessage({ id: "relay.advanced" })}
              <Icon name="chevron-down" className="w-3.5 h-3.5 ml-auto transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-4 pt-1">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{formatMessage({ id: "relay.reconnect" })}</p>
                  <p className="text-xs text-stone-500 mt-0.5">{formatMessage({ id: "relay.reconnectHelp" })}</p>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={form.reconnect}
                    onChange={e => setForm(f => ({ ...f, reconnect: e.target.checked }))}
                  />
                  <span className="track" />
                  <span className="thumb" />
                </label>
              </div>
              {form.reconnect && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label" htmlFor="r-interval">{formatMessage({ id: "relay.reconnectInterval" })}</label>
                    <input
                      id="r-interval"
                      className="input"
                      type="number"
                      min={0}
                      placeholder={formatMessage({ id: "relay.reconnectIntervalPlaceholder" })}
                      value={form.reconnectInterval}
                      onChange={e => setForm(f => ({ ...f, reconnectInterval: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="r-max">{formatMessage({ id: "relay.maxAttempts" })}</label>
                    <input
                      id="r-max"
                      className="input"
                      type="number"
                      min={0}
                      placeholder={formatMessage({ id: "relay.maxAttemptsPlaceholder" })}
                      value={form.maxReconnectAttempts}
                      onChange={e => setForm(f => ({ ...f, maxReconnectAttempts: e.target.value }))}
                    />
                  </div>
                </div>
              )}
            </div>
          </details>

          <div className="flex gap-2 pt-1">
            <button type="submit" className="btn btn-primary flex-1" disabled={submitting}>
              {submitting && <Icon name="refresh-cw" className="w-3.5 h-3.5 animate-spin" />}
              {formatMessage({ id: "relay.addTask" })}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setForm(f => ({ ...EMPTY_FORM, mode: f.mode }))}
              disabled={submitting}
            >
              {formatMessage({ id: "relay.reset" })}
            </button>
          </div>
        </form>

        {/* tasks table */}
        <div className="card overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
            <div>
              <h3 className="font-semibold">{formatMessage({ id: "relay.tasksTitle" })}</h3>
              <p className="text-xs text-stone-500 mt-0.5">{formatMessage({ id: "relay.tasksSubtitle" })}</p>
            </div>
            <button className="btn btn-ghost btn-sm" disabled={loading} onClick={() => load()}>
              <Icon name="refresh-cw" className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              {formatMessage({ id: "common.refresh" })}
            </button>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{formatMessage({ id: "relay.colTask" })}</th>
                  <th>{formatMessage({ id: "relay.colType" })}</th>
                  <th>{formatMessage({ id: "relay.colPath" })}</th>
                  <th>{formatMessage({ id: "common.status" })}</th>
                  <th>{formatMessage({ id: "relay.colTraffic" })}</th>
                  <th>{formatMessage({ id: "common.duration" })}</th>
                  <th className="text-right">{formatMessage({ id: "common.actions" })}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="flex items-center justify-center gap-2 py-14 text-stone-400">
                        <Icon name="refresh-cw" className="w-4 h-4 animate-spin" />
                        <span className="text-sm">{formatMessage({ id: "relay.loading" })}</span>
                      </div>
                    </td>
                  </tr>
                ) : tasks.length ? (
                  tasks.map(task => {
                    const mode = taskMode(task);
                    const key = task.taskKey ?? task.id;
                    const src = mode === "pull" ? taskUrl(task) : task.streamPath;
                    const dst = mode === "pull" ? task.streamPath : taskUrl(task);
                    return (
                      <tr key={key}>
                        <td>
                          <div className="font-medium font-mono text-[13px]">{task.streamPath}</div>
                          <div className="text-xs text-stone-400 font-mono">{task.id}</div>
                        </td>
                        <td>
                          <span className={`badge ${mode === "push" ? "badge-neutral" : "badge-info"}`}>
                            <Icon name={mode === "push" ? "corner-up-right" : "corner-down-left"} className="w-3 h-3" />
                            {formatMessage({ id: mode === "push" ? "relay.push" : "relay.pull" })} · {task.protocol.toUpperCase()}
                          </span>
                        </td>
                        <td>
                          <div className="text-xs text-stone-400 font-mono truncate" style={{ maxWidth: 260 }} title={src}>
                            {src}
                          </div>
                          <div className="text-xs text-stone-500 flex items-center gap-1 mt-0.5">
                            <Icon name="corner-down-right" className="w-3 h-3 shrink-0" />
                            <span className="truncate font-mono" style={{ maxWidth: 240 }} title={dst}>
                              {dst}
                            </span>
                          </div>
                        </td>
                        <td>
                          {task.isClosing ? (
                            <span className="badge badge-neutral">{formatMessage({ id: "relay.stopping" })}</span>
                          ) : task.reconnectAttempts > 0 ? (
                            <span className="badge badge-warning">
                              {formatMessage({ id: "relay.reconnecting" }, { count: task.reconnectAttempts })}
                            </span>
                          ) : task.isRunning ? (
                            <span className="badge badge-success">
                              <span className="dot-live" style={{ width: 6, height: 6 }} />
                              &nbsp;{formatMessage({ id: "relay.running" })}
                            </span>
                          ) : (
                            <span className="badge badge-warning">{formatMessage({ id: "relay.connecting" })}</span>
                          )}
                        </td>
                        <td className="text-xs text-stone-500 tabular-nums whitespace-nowrap">
                          <div>↓ {fmtBytes(task.inBytes)}</div>
                          <div>↑ {fmtBytes(task.outBytes)}</div>
                        </td>
                        <td className="tabular-nums">{fmtDur(taskDuration(task, tick))}</td>
                        <td>
                          <div className="flex items-center gap-0.5 justify-end">
                            <button
                              className="btn btn-ghost btn-sm btn-icon text-red-600 hover:bg-red-50"
                              title={formatMessage({ id: "relay.deleteTask" })}
                              disabled={deleting === key}
                              onClick={() => remove(task)}
                            >
                              <Icon name="trash-2" className={`w-3.5 h-3.5 ${deleting === key ? "animate-pulse" : ""}`} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7}>
                      <div className="flex flex-col items-center justify-center py-14 text-stone-400">
                        <Icon name="inbox" className="w-8 h-8 mb-2" />
                        <span className="text-sm">{formatMessage({ id: "relay.empty" })}</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
