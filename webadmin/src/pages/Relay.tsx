import { useCallback, useEffect, useState } from "react";
import Icon from "../components/Icon";
import { fetchRelayTasks, addRelayTask, removeRelayTask } from "../lib/api";
import type { ApiRelayTask, RelayTaskInput } from "../lib/api";
import { fmtBytes, fmtDur } from "../lib/format";
import { toast } from "../lib/toast";

const POLL_INTERVAL = 5000;

interface RelayForm {
  mode: "push" | "pull";
  url: string;
  streamPath: string;
  transport: string;
  reconnect: boolean;
  reconnectInterval: string;
  maxReconnectAttempts: string;
}

const EMPTY_FORM: RelayForm = {
  mode: "push",
  url: "",
  streamPath: "",
  transport: "tcp",
  reconnect: true,
  reconnectInterval: "",
  maxReconnectAttempts: ""
};

/** Mirror the server-side validation in src/api/handlers/relay.js. */
function validateForm(form: RelayForm): string | null {
  if (!form.url.trim()) return "请填写远端地址";
  let parsed: URL;
  try {
    parsed = new URL(form.url.trim());
  } catch {
    return "远端地址格式无效";
  }
  if (parsed.protocol !== "rtsp:" && parsed.protocol !== "rtmp:") return "仅支持 rtsp:// 或 rtmp:// 地址";
  if (form.mode === "push" && parsed.protocol !== "rtmp:") return "推流转发仅支持 RTMP 地址";
  if (!form.streamPath.trim()) return "请填写本机流路径";
  if (!form.streamPath.trim().startsWith("/")) return "本机流路径需以 / 开头，如 /live/camera1";
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
      setError(e instanceof Error ? e.message : "加载转发任务失败");
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
      toast(problem, "warning");
      return;
    }
    setSubmitting(true);
    const interval = Number(form.reconnectInterval);
    const maxAttempts = Number(form.maxReconnectAttempts);
    const input: RelayTaskInput = {
      url: form.url.trim(),
      mode: form.mode,
      streamPath: form.streamPath.trim(),
      transport: form.transport,
      reconnect: form.reconnect,
      ...(form.reconnect && Number.isFinite(interval) && interval > 0 ? { reconnectInterval: interval } : {}),
      ...(form.reconnect && Number.isFinite(maxAttempts) && maxAttempts > 0 ? { maxReconnectAttempts: maxAttempts } : {})
    };
    try {
      await addRelayTask(input);
      toast(`转发任务创建成功：${input.streamPath}`);
      setForm(f => ({ ...EMPTY_FORM, mode: f.mode }));
      await load(true);
    } catch (err) {
      toast(err instanceof Error ? err.message : "创建转发任务失败", "danger");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (t: ApiRelayTask) => {
    const key = t.taskKey;
    if (!key || deleting) return;
    setDeleting(key);
    try {
      await removeRelayTask(key);
      toast(`转发任务已删除：${t.streamPath}`, "danger");
      await load(true);
    } catch (err) {
      toast(err instanceof Error ? err.message : "删除任务失败", "danger");
    } finally {
      setDeleting(null);
    }
  };

  // reconnectAttempts reset to 0 on every successful connect, so a non-zero
  // value means the task is in a reconnect cycle right now.
  const running = tasks.filter(t => t.isRunning && t.reconnectAttempts === 0).length;
  const totalBytes = tasks.reduce((a, t) => a + t.inBytes + t.outBytes, 0);

  const urlLabel = form.mode === "push" ? "RTMP 推流地址" : "RTSP / RTMP 源地址";
  const urlPlaceholder = form.mode === "push" ? "rtmp://cdn.example.com/live/key" : "rtsp://camera.example.com:554/stream";

  return (
    <main className="p-4 md:p-6 max-w-[1440px] mx-auto space-y-4 md:space-y-6">
      {/* header */}
      <div>
        <h1 className="text-xl md:text-2xl font-semibold tracking-tight">流转发</h1>
        <p className="text-sm text-stone-500 mt-1">将本机流推送到外部平台，或从远端源拉回流进行分发</p>
      </div>

      {/* error banner */}
      {error && (
        <div className="card flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-red-200 bg-red-50">
          <div className="flex items-center gap-2 text-sm text-red-700">
            <Icon name="alert-circle" className="w-4 h-4 shrink-0" />
            转发任务加载失败：{error}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => load()}>
            重试
          </button>
        </div>
      )}

      {/* stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-stone-500">运行中任务</p>
            <p className="text-2xl font-semibold tabular-nums mt-0.5">{running}</p>
          </div>
          <span className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <Icon name="zap" className="w-4 h-4" />
          </span>
        </div>
        <div className="card px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-stone-500">任务总数</p>
            <p className="text-2xl font-semibold tabular-nums mt-0.5">{tasks.length}</p>
          </div>
          <span className="w-9 h-9 rounded-lg bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-600">
            <Icon name="layers" className="w-4 h-4" />
          </span>
        </div>
        <div className="card px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-stone-500">累计转发流量</p>
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
          <h3 className="font-semibold">新建转发任务</h3>
          <p className="text-xs text-stone-500 mt-0.5 mb-5">配置一条 push 推流或 pull 拉流规则</p>

          <div className="mb-4">
            <label className="label">任务类型</label>
            <div className="seg w-full">
              <button
                type="button"
                className={`seg-btn flex-1 justify-center ${form.mode === "push" ? "active" : ""}`}
                onClick={() => setForm(f => ({ ...f, mode: "push" }))}
              >
                <Icon name="corner-up-right" className="w-3.5 h-3.5" />
                推流转发
              </button>
              <button
                type="button"
                className={`seg-btn flex-1 justify-center ${form.mode === "pull" ? "active" : ""}`}
                onClick={() => setForm(f => ({ ...f, mode: "pull" }))}
              >
                <Icon name="corner-down-left" className="w-3.5 h-3.5" />
                拉流代理
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
              {form.mode === "push" ? "本机流将被推送到该 RTMP 地址" : "从该地址拉流并代理到本机；支持 RTSP（仅拉流）与 RTMP"}
            </p>
          </div>

          <div className="mb-2">
            <label className="label" htmlFor="r-path">本机流路径</label>
            <input
              id="r-path"
              className="input font-mono text-xs"
              placeholder="/live/camera1"
              value={form.streamPath}
              onChange={e => setForm(f => ({ ...f, streamPath: e.target.value }))}
            />
            <p className="help">以 / 开头的 app/name 路径；推流转发时须为已存在的本机流</p>
          </div>

          <details className="mb-4 group">
            <summary className="text-[13px] font-medium text-stone-600 cursor-pointer select-none flex items-center gap-1.5 py-2">
              <Icon name="sliders" className="w-3.5 h-3.5" />
              高级选项
              <Icon name="chevron-down" className="w-3.5 h-3.5 ml-auto transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-4 pt-1">
              <div>
                <label className="label" htmlFor="r-transport">RTSP 传输协议</label>
                <select
                  id="r-transport"
                  className="select"
                  value={form.transport}
                  onChange={e => setForm(f => ({ ...f, transport: e.target.value }))}
                >
                  <option value="tcp">TCP</option>
                  <option value="udp">UDP</option>
                </select>
                <p className="help">仅对 RTSP 拉流生效</p>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">断线自动重连</p>
                  <p className="text-xs text-stone-500 mt-0.5">连接失败时按指数退避自动重试</p>
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
                    <label className="label" htmlFor="r-interval">重连间隔 (ms)</label>
                    <input
                      id="r-interval"
                      className="input"
                      type="number"
                      min={0}
                      placeholder="默认 5000"
                      value={form.reconnectInterval}
                      onChange={e => setForm(f => ({ ...f, reconnectInterval: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="r-max">最大重连次数</label>
                    <input
                      id="r-max"
                      className="input"
                      type="number"
                      min={0}
                      placeholder="0 = 不限"
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
              添加任务
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setForm(f => ({ ...EMPTY_FORM, mode: f.mode }))}
              disabled={submitting}
            >
              重置
            </button>
          </div>
        </form>

        {/* tasks table */}
        <div className="card overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
            <div>
              <h3 className="font-semibold">转发任务</h3>
              <p className="text-xs text-stone-500 mt-0.5">任务的创建与删除会实时下发到 Node-Media-Server</p>
            </div>
            <button className="btn btn-ghost btn-sm" disabled={loading} onClick={() => load()}>
              <Icon name="refresh-cw" className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              刷新
            </button>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>任务</th>
                  <th>类型</th>
                  <th>转发路径</th>
                  <th>状态</th>
                  <th>流量</th>
                  <th>时长</th>
                  <th className="text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="flex items-center justify-center gap-2 py-14 text-stone-400">
                        <Icon name="refresh-cw" className="w-4 h-4 animate-spin" />
                        <span className="text-sm">正在加载转发任务…</span>
                      </div>
                    </td>
                  </tr>
                ) : tasks.length ? (
                  tasks.map(t => {
                    const mode = taskMode(t);
                    const key = t.taskKey ?? t.id;
                    const src = mode === "pull" ? taskUrl(t) : t.streamPath;
                    const dst = mode === "pull" ? t.streamPath : taskUrl(t);
                    return (
                      <tr key={key}>
                        <td>
                          <div className="font-medium font-mono text-[13px]">{t.streamPath}</div>
                          <div className="text-xs text-stone-400 font-mono">{t.id}</div>
                        </td>
                        <td>
                          <span className={`badge ${mode === "push" ? "badge-neutral" : "badge-info"}`}>
                            <Icon name={mode === "push" ? "corner-up-right" : "corner-down-left"} className="w-3 h-3" />
                            {mode === "push" ? "推流转发" : "拉流代理"} · {t.protocol.toUpperCase()}
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
                          {t.isClosing ? (
                            <span className="badge badge-neutral">停止中</span>
                          ) : t.reconnectAttempts > 0 ? (
                            <span className="badge badge-warning">重连中 · {t.reconnectAttempts} 次</span>
                          ) : t.isRunning ? (
                            <span className="badge badge-success">
                              <span className="dot-live" style={{ width: 6, height: 6 }} />
                              &nbsp;运行中
                            </span>
                          ) : (
                            <span className="badge badge-warning">连接中</span>
                          )}
                        </td>
                        <td className="text-xs text-stone-500 tabular-nums whitespace-nowrap">
                          <div>↓ {fmtBytes(t.inBytes)}</div>
                          <div>↑ {fmtBytes(t.outBytes)}</div>
                        </td>
                        <td className="tabular-nums">{fmtDur(taskDuration(t, tick))}</td>
                        <td>
                          <div className="flex items-center gap-0.5 justify-end">
                            <button
                              className="btn btn-ghost btn-sm btn-icon text-red-600 hover:bg-red-50"
                              title="删除任务"
                              disabled={deleting === key}
                              onClick={() => remove(t)}
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
                        <span className="text-sm">暂无转发任务，使用左侧表单创建</span>
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
