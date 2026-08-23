import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../components/Icon";
import { posterUrl } from "../lib/mock";
import { fetchStreams, deleteSession } from "../lib/api";
import type { ApiStream, StreamStatus } from "../lib/api";
import { fmtNum, fmtDur, fmtBytes } from "../lib/format";
import { toast } from "../lib/toast";

const PAGE_SIZE = 8;
const POLL_INTERVAL = 5000;

/* FLV codec id / fourcc → display name (values come from publish metadata). */
const VIDEO_CODEC_IDS: Record<number, string> = {
  2: "H.263",
  3: "Screen",
  4: "VP6",
  5: "VP6A",
  6: "Screen2",
  7: "H.264"
};
const VIDEO_FOURCC: Record<string, string> = {
  avc1: "H.264",
  hvc1: "H.265",
  hev1: "H.265",
  av01: "AV1",
  vp09: "VP9"
};
const AUDIO_CODEC_IDS: Record<number, string> = {
  1: "ADPCM",
  2: "MP3",
  7: "G.711A",
  8: "G.711µ",
  10: "AAC",
  11: "Speex",
  14: "MP3"
};

function codecName(codec: number | string | undefined, idMap: Record<number, string>, fourccMap?: Record<string, string>): string {
  if (codec === undefined || codec === null || codec === 0 || codec === "") return "—";
  if (typeof codec === "number") return idMap[codec] || `Codec ${codec}`;
  if (fourccMap && fourccMap[codec]) return fourccMap[codec];
  return codec.toUpperCase();
}

/** Average bitrate in Mbps: cumulative inBytes over publish duration. */
function avgBitrateMbps(s: ApiStream, now: number): number {
  const p = s.publisher;
  if (!p || !p.inBytes || !p.createTime) return 0;
  const seconds = (now - p.createTime) / 1000;
  if (seconds < 1) return 0;
  return (p.inBytes * 8) / seconds / 1e6;
}

/* Real publish state from the server: "reconnecting" entries are held for the
   same client to resume within the grace window. */
const STATUS_BADGE: Record<StreamStatus, { label: string; cls: string; live?: boolean }> = {
  publishing: { label: "推流中", cls: "badge-success", live: true },
  reconnecting: { label: "等待重连", cls: "badge-warning" },
  idle: { label: "等待推流", cls: "badge-neutral" }
};

export default function Streams() {
  const [list, setList] = useState<ApiStream[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(() => Date.now());
  const [q, setQ] = useState("");
  const [fApp, setFApp] = useState("");
  const [fProto, setFProto] = useState("");
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<ApiStream | null>(null);
  const [recFlags, setRecFlags] = useState<Record<string, boolean>>({});
  const [kicking, setKicking] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setList(await fetchStreams());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载流列表失败");
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreview(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const apps = useMemo(() => [...new Set(list.map(s => s.app))].sort(), [list]);
  const protos = useMemo(
    () => [...new Set(list.map(s => s.publisher?.protocol).filter((p): p is string => !!p))].sort(),
    [list]
  );

  const filtered = list.filter(
    s =>
      (!q || (s.name + s.app).toLowerCase().includes(q.toLowerCase())) &&
      (!fApp || s.app === fApp) &&
      (!fProto || s.publisher?.protocol === fProto)
  );

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const curPage = Math.min(page, pages);
  const rows = filtered.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);

  const totalViewers = list.reduce((a, s) => a + s.subscribers, 0);
  const totalPublishing = list.filter(s => s.status === "publishing").length;
  const totalInBytes = list.reduce((a, s) => a + (s.publisher?.inBytes ?? 0), 0);

  const statusBadge = (s: ApiStream) => {
    const st = STATUS_BADGE[s.status];
    return (
      <span className={`badge ${st.cls}`}>
        {st.live && <span className="dot-live" style={{ width: 6, height: 6 }} />}
        &nbsp;{st.label}
      </span>
    );
  };

  const toggleRec = (s: ApiStream) => {
    const rec = !recFlags[s.key];
    setRecFlags(prev => ({ ...prev, [s.key]: rec }));
    toast(rec ? `已开始录制「${s.name}」（演示）` : `已停止录制「${s.name}」（演示）`);
  };

  const kick = async (s: ApiStream) => {
    if (!s.publisher || s.status !== "publishing" || kicking) return;
    setKicking(s.key);
    try {
      await deleteSession(s.publisher.id);
      toast(`已断开流 ${s.app}/${s.name}`, "danger");
      await load(true);
    } catch (e) {
      toast(e instanceof Error ? e.message : "断开失败", "danger");
    } finally {
      setKicking(null);
    }
  };

  const videoInfo = (s: ApiStream) => {
    const p = s.publisher;
    const res = p?.videoWidth && p?.videoHeight ? `${p.videoWidth}×${p.videoHeight}` : "—";
    const vcodec = codecName(p?.videoCodec, VIDEO_CODEC_IDS, VIDEO_FOURCC);
    const acodec = codecName(p?.audioCodec, AUDIO_CODEC_IDS);
    // metadata framerates are often fractional (23.977…); display rounded
    const fps = p?.videoFramerate ? Math.round(p.videoFramerate) : 0;
    return { res, codec: `${vcodec} / ${acodec}`, fps };
  };

  return (
    <main className="p-4 md:p-6 max-w-[1440px] mx-auto space-y-4 md:space-y-6">
      {/* header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight">流列表</h1>
          <p className="text-sm text-stone-500 mt-1">管理当前接入的所有推流与拉流会话</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-secondary btn-sm" disabled={loading} onClick={() => load()}>
            <Icon name="refresh-cw" className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            刷新
          </button>
          <Link to="/relay" className="btn btn-primary btn-sm">
            <Icon name="plus" className="w-3.5 h-3.5" />
            新建拉流
          </Link>
        </div>
      </div>

      {/* error banner */}
      {error && (
        <div className="card flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-red-200 bg-red-50">
          <div className="flex items-center gap-2 text-sm text-red-700">
            <Icon name="alert-circle" className="w-4 h-4 shrink-0" />
            流列表加载失败：{error}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => load()}>
            重试
          </button>
        </div>
      )}

      {/* mini stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-stone-500">推流中</p>
            <p className="text-2xl font-semibold tabular-nums mt-0.5">{totalPublishing}</p>
          </div>
          <span className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <Icon name="radio" className="w-4 h-4" />
          </span>
        </div>
        <div className="card px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-stone-500">总观众数</p>
            <p className="text-2xl font-semibold tabular-nums mt-0.5">{fmtNum(totalViewers)}</p>
          </div>
          <span className="w-9 h-9 rounded-lg bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-600">
            <Icon name="users" className="w-4 h-4" />
          </span>
        </div>
        <div className="card px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-stone-500">累计上行流量</p>
            <p className="text-2xl font-semibold tabular-nums mt-0.5">{fmtBytes(totalInBytes)}</p>
          </div>
          <span className="w-9 h-9 rounded-lg bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600">
            <Icon name="trending-up" className="w-4 h-4" />
          </span>
        </div>
      </div>

      {/* filters */}
      <div className="card p-4 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Icon name="search" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
          <input
            className="input"
            style={{ paddingLeft: "2.25rem" }}
            placeholder="搜索流名称 / 应用…"
            value={q}
            onChange={e => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          className="select md:w-40"
          value={fApp}
          onChange={e => {
            setFApp(e.target.value);
            setPage(1);
          }}
        >
          <option value="">全部应用</option>
          {apps.map(a => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select
          className="select md:w-40"
          value={fProto}
          onChange={e => {
            setFProto(e.target.value);
            setPage(1);
          }}
        >
          <option value="">全部协议</option>
          {protos.map(p => (
            <option key={p} value={p}>
              {p.toUpperCase()}
            </option>
          ))}
        </select>
      </div>

      {/* table */}
      <div className="card overflow-hidden">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>流</th>
                <th>应用</th>
                <th>协议</th>
                <th>发布者</th>
                <th>视频信息</th>
                <th>平均码率</th>
                <th>观众</th>
                <th>时长</th>
                <th>状态</th>
                <th className="text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10}>
                    <div className="flex items-center justify-center gap-2 py-14 text-stone-400">
                      <Icon name="refresh-cw" className="w-4 h-4 animate-spin" />
                      <span className="text-sm">正在加载流列表…</span>
                    </div>
                  </td>
                </tr>
              ) : rows.length ? (
                rows.map(s => {
                  const p = s.publisher;
                  const { res, codec, fps } = videoInfo(s);
                  const mbps = avgBitrateMbps(s, tick);
                  const rec = !!recFlags[s.key];
                  return (
                    <tr key={s.key}>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-stone-100 border border-stone-200/60 flex items-center justify-center text-stone-500 shrink-0">
                            <Icon name="video" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium">{s.name}</div>
                            <div className="text-xs text-stone-400 font-mono">{s.app}/{s.name}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-outline">{s.app}</span>
                      </td>
                      <td>{p ? p.protocol.toUpperCase() : "—"}</td>
                      <td className="text-stone-500 font-mono text-xs">{p?.ip ?? "—"}</td>
                      <td>
                        <div className="text-sm">
                          {res}{fps ? ` · ${fps}fps` : ""}
                        </div>
                        <div className="text-xs text-stone-400">{codec}</div>
                      </td>
                      <td className="tabular-nums">{mbps ? `${mbps.toFixed(2)} Mbps` : "—"}</td>
                      <td className="tabular-nums">{fmtNum(s.subscribers)}</td>
                      <td className="tabular-nums">{p ? fmtDur((tick - p.createTime) / 1000) : "—"}</td>
                      <td>
                        {statusBadge(s)}
                      </td>
                      <td>
                        <div className="flex items-center gap-0.5">
                          <button className="btn btn-ghost btn-sm btn-icon" title="预览" onClick={() => setPreview(s)}>
                            <Icon name="play" className="w-3.5 h-3.5" />
                          </button>
                          <button
                            className={`btn btn-ghost btn-sm btn-icon ${rec ? "text-emerald-600" : ""}`}
                            title="录制（演示）"
                            onClick={() => toggleRec(s)}
                          >
                            <Icon name="disc" className="w-3.5 h-3.5" />
                          </button>
                          <button
                            className="btn btn-ghost btn-sm btn-icon text-red-600 hover:bg-red-50"
                            title="断开"
                            disabled={s.status !== "publishing" || kicking === s.key}
                            onClick={() => kick(s)}
                          >
                            <Icon name="slash" className={`w-3.5 h-3.5 ${kicking === s.key ? "animate-spin" : ""}`} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10}>
                    <div className="flex flex-col items-center justify-center py-14 text-stone-400">
                      <Icon name={list.length ? "search" : "video-off"} className="w-8 h-8 mb-2" />
                      <span className="text-sm">{list.length ? "未找到匹配的流" : "当前没有活跃的流"}</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-4 border-t border-stone-200">
          <span className="text-xs text-stone-500">
            共 {filtered.length} 条流 · 第 {curPage} / {pages} 页
          </span>
          <div className="flex items-center">
            <button className="pg" disabled={curPage === 1} onClick={() => setPage(curPage - 1)}>
              <Icon name="chevron-left" className="w-4 h-4" />
            </button>
            {Array.from({ length: pages }, (_, i) => i + 1).map(p => (
              <button key={p} className={`pg ${p === curPage ? "pg-active" : ""}`} onClick={() => setPage(p)}>
                {p}
              </button>
            ))}
            <button className="pg" disabled={curPage === pages} onClick={() => setPage(curPage + 1)}>
              <Icon name="chevron-right" className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* preview modal */}
      <div className={preview ? "modal-overlay open" : "modal-overlay"} onClick={e => e.target === e.currentTarget && setPreview(null)}>
        <div className="modal-card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
            <div>
              <h3 className="font-semibold">{preview?.name ?? "流预览"}</h3>
              <p className="text-xs text-stone-500 mt-0.5 font-mono">
                {preview ? `${preview.app}/${preview.name} · ${preview.publisher?.protocol.toUpperCase() ?? "—"}` : "—"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {preview && statusBadge(preview)}
              <button className="btn btn-ghost btn-icon" title="关闭" onClick={() => setPreview(null)}>
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="relative bg-neutral-950">
            <img
              className="w-full aspect-video object-cover opacity-70"
              alt="stream preview"
              src={preview ? posterUrl(preview.app) : undefined}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className="w-16 h-16 rounded-full bg-white/90 backdrop-blur flex items-center justify-center text-neutral-900 shadow-2xl hover:scale-105 transition cursor-pointer"
                onClick={() => toast("播放器加载中（演示环境）")}
              >
                <Icon name="play" className="w-7 h-7 ml-1" />
              </div>
            </div>
            <div className="absolute bottom-0 inset-x-0 px-4 py-3 bg-linear-to-t from-neutral-950/90 to-transparent flex items-center justify-between text-xs text-white">
              <div className="flex items-center gap-4">
                <span className="tabular-nums">
                  {preview && avgBitrateMbps(preview, tick) ? `${avgBitrateMbps(preview, tick).toFixed(2)} Mbps` : "—"}
                </span>
                <span className="tabular-nums">{preview ? `${fmtNum(preview.subscribers)} 观众` : "—"}</span>
              </div>
              <span className="tabular-nums">{preview ? `${videoInfo(preview).res} · ${videoInfo(preview).codec}` : "—"}</span>
            </div>
          </div>
          <div className="px-5 py-3 bg-stone-50 border-t border-stone-200 text-xs text-stone-500 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <span>HTTP-FLV 播放地址</span>
            <code className="text-stone-600">{preview ? `${window.location.origin}${preview.key}.flv` : "—"}</code>
          </div>
        </div>
      </div>
    </main>
  );
}
