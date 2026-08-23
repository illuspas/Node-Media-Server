import { useCallback, useEffect, useState } from "react";
import Icon from "../components/Icon";
import { fmtBytes, fmtDur, fmtDurLong, fmtNum } from "../lib/format";
import { toast } from "../lib/toast";
import { ApiError, deleteHistory, fetchHistory } from "../lib/api";
import type { ApiHistoryEntry, HistoryPage } from "../lib/api";

const PAGE_SIZE = 20;
const POLL_MS = 30000;
const SEARCH_DEBOUNCE_MS = 300;

/* publisher session protocols that can appear in the history store */
const PROTOCOLS = ["rtmp", "rtsp", "flv"];

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleString("zh-CN", { hour12: false });
}

export default function History() {
  const [data, setData] = useState<HistoryPage>({
    items: [], count: 0, page: 1, pageSize: PAGE_SIZE,
  });
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [fProto, setFProto] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async (targetPage: number, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const body = await fetchHistory({
        search: search || undefined,
        protocol: fProto || undefined,
        page: targetPage,
        pageSize: PAGE_SIZE,
      });
      setData({
        items: body.items ?? [],
        count: body.count ?? 0,
        page: body.page ?? targetPage,
        pageSize: body.pageSize ?? PAGE_SIZE,
      });
      setError(null);
    } catch (err) {
      /* silent polling keeps the previous snapshot and banner */
      if (!silent) setError(err instanceof ApiError ? err.message : "加载历史记录失败");
    } finally {
      setLoading(false);
    }
  }, [search, fProto]);

  /* debounce the search box into a server-side query */
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(q.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    // Fetch-on-mount is a legitimate external-system sync; every setState in
    // load() runs after the awaited response, never synchronously.
    // oxlint-disable-next-line react/set-state-in-effect
    void load(page);
    const iv = setInterval(() => {
      if (!document.hidden) load(page, true);
    }, POLL_MS);
    return () => clearInterval(iv);
  }, [load, page]);

  const removeStream = async (h: ApiHistoryEntry) => {
    if (!window.confirm(`删除流 ${h.streamPath} 的全部历史记录？该流的播放量计数也会被重置。`)) return;
    setBusyPath(h.streamPath);
    try {
      await deleteHistory(h.streamPath);
      toast(`已清除 ${h.streamPath} 的历史记录`);
      if (data.items.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        load(page);
      }
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "删除失败", "danger");
    } finally {
      setBusyPath(null);
    }
  };

  const clearAll = async () => {
    if (!window.confirm("确定清空全部历史记录？所有流的播放量计数也会被重置，此操作不可恢复。")) return;
    setClearing(true);
    try {
      await deleteHistory();
      toast("已清空全部历史记录");
      setPage(1);
      load(1);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "清空失败", "danger");
    } finally {
      setClearing(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(data.count / PAGE_SIZE));
  const pageDuration = data.items.reduce((a, h) => a + (h.duration ?? 0), 0);
  const pageInBytes = data.items.reduce((a, h) => a + (h.inBytes ?? 0), 0);
  const pageStreams = new Set(data.items.map(h => h.streamPath)).size;

  return (
    <main className="p-4 md:p-6 max-w-[1440px] mx-auto space-y-4 md:space-y-6">
      {/* header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight">流历史</h1>
          <p className="text-sm text-stone-500 mt-1">回顾已结束推流的历史记录与播放统计</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-secondary btn-sm" disabled={loading} onClick={() => load(page)}>
            <Icon name="refresh-cw" className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            刷新
          </button>
          <button
            className="btn btn-secondary btn-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
            disabled={clearing || data.count === 0}
            onClick={clearAll}
          >
            <Icon name="trash-2" className="w-3.5 h-3.5" />
            清空历史
          </button>
        </div>
      </div>

      {error && (
        <div className="card flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-red-200 bg-red-50">
          <div className="flex items-center gap-2 text-sm text-red-700">
            <Icon name="alert-circle" className="w-4 h-4 shrink-0" />
            历史记录加载失败：{error}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => load(page)}>
            重试
          </button>
        </div>
      )}

      {/* stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-stone-500">记录总数</p>
            <p className="text-2xl font-semibold tabular-nums mt-0.5">{fmtNum(data.count)}</p>
          </div>
          <span className="w-9 h-9 rounded-lg bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-600">
            <Icon name="clock" className="w-4 h-4" />
          </span>
        </div>
        <div className="card px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-stone-500">本页推流时长</p>
            <p className="text-2xl font-semibold tabular-nums mt-0.5">{fmtDurLong(pageDuration / 1000)}</p>
          </div>
          <span className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <Icon name="video" className="w-4 h-4" />
          </span>
        </div>
        <div className="card px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-stone-500">本页上行流量</p>
            <p className="text-2xl font-semibold tabular-nums mt-0.5">{fmtBytes(pageInBytes)}</p>
          </div>
          <span className="w-9 h-9 rounded-lg bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600">
            <Icon name="trending-up" className="w-4 h-4" />
          </span>
        </div>
        <div className="card px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-stone-500">本页涉及流数</p>
            <p className="text-2xl font-semibold tabular-nums mt-0.5">{fmtNum(pageStreams)}</p>
          </div>
          <span className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
            <Icon name="users" className="w-4 h-4" />
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
            placeholder="搜索流路径 / 推流 IP…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>
        <select
          className="select md:w-40"
          value={fProto}
          onChange={e => {
            setFProto(e.target.value);
            setPage(1);
          }}
        >
          <option value="">全部协议</option>
          {PROTOCOLS.map(p => (
            <option key={p} value={p}>
              {p.toUpperCase()}
            </option>
          ))}
        </select>
      </div>

      {/* table */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
          <div>
            <h3 className="font-semibold">推流记录</h3>
            <p className="text-xs text-stone-500 mt-0.5">
              共 {fmtNum(data.count)} 条，按开始时间倒序 · 播放量为该流的累计值
            </p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>流</th>
                <th>协议</th>
                <th>推流 IP</th>
                <th>开始时间</th>
                <th>结束时间</th>
                <th>时长</th>
                <th>上行流量</th>
                <th>播放量</th>
                <th className="text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9}>
                    <div className="flex items-center justify-center gap-2 py-14 text-stone-400">
                      <Icon name="refresh-cw" className="w-4 h-4 animate-spin" />
                      <span className="text-sm">正在加载历史记录…</span>
                    </div>
                  </td>
                </tr>
              ) : data.items.length ? (
                data.items.map(h => (
                  <tr key={h.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="event-ic">
                          <Icon name="video" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium">{h.name}</div>
                          <div className="text-xs text-stone-400 font-mono">{h.streamPath}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-outline">{h.protocol.toUpperCase()}</span>
                    </td>
                    <td className="text-stone-500 font-mono text-xs">{h.ip}</td>
                    <td className="text-stone-500">{fmtTime(h.startTime)}</td>
                    <td className="text-stone-500">{fmtTime(h.endTime)}</td>
                    <td className="tabular-nums">{fmtDur((h.duration ?? 0) / 1000)}</td>
                    <td className="tabular-nums">{fmtBytes(h.inBytes ?? 0)}</td>
                    <td className="tabular-nums">{fmtNum(h.playCount ?? 0)}</td>
                    <td>
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          className="btn btn-ghost btn-sm btn-icon"
                          title="复制流路径"
                          onClick={() => {
                            navigator.clipboard?.writeText(h.streamPath).then(
                              () => toast(`已复制：${h.streamPath}`),
                              () => toast(h.streamPath)
                            );
                          }}
                        >
                          <Icon name="copy" className="w-3.5 h-3.5" />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm btn-icon text-red-600 hover:bg-red-50 disabled:opacity-50"
                          title="删除该流的全部历史"
                          disabled={busyPath === h.streamPath}
                          onClick={() => removeStream(h)}
                        >
                          <Icon name="trash-2" className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9}>
                    <div className="flex flex-col items-center justify-center py-14 text-stone-400">
                      <Icon name={search || fProto ? "search" : "clock"} className="w-8 h-8 mb-2" />
                      <span className="text-sm">
                        {search || fProto ? "未找到匹配的历史记录" : "还没有历史记录，推流结束后会自动归档"}
                      </span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {data.count > PAGE_SIZE && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-stone-200 text-sm">
            <span className="text-stone-500">
              第 {data.page} / {totalPages} 页
            </span>
            <div className="flex gap-2">
              <button
                className="btn btn-secondary btn-sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                上一页
              </button>
              <button
                className="btn btn-secondary btn-sm"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
