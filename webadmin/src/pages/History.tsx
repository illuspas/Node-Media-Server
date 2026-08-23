import { useCallback, useEffect, useState } from "react";
import { useIntl } from "react-intl";
import Icon from "../components/Icon";
import { fmtBytes, fmtDur, fmtDurLong, fmtNum, fmtDateTime } from "../lib/format";
import { toast } from "../lib/toast";
import { t } from "../i18n";
import { ApiError, deleteHistory, fetchHistory } from "../lib/api";
import type { ApiHistoryEntry, HistoryPage } from "../lib/api";

const PAGE_SIZE = 20;
const POLL_MS = 30000;
const SEARCH_DEBOUNCE_MS = 300;

/* publisher session protocols that can appear in the history store */
const PROTOCOLS = ["rtmp", "rtsp", "flv"];

export default function History() {
  const { formatMessage } = useIntl();
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
      if (!silent) setError(err instanceof ApiError ? err.message : t("history.errLoad"));
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
    if (!window.confirm(formatMessage({ id: "history.confirmClearOne" }, { path: h.streamPath }))) return;
    setBusyPath(h.streamPath);
    try {
      await deleteHistory(h.streamPath);
      toast(formatMessage({ id: "history.toastClearedStream" }, { path: h.streamPath }));
      if (data.items.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        load(page);
      }
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t("history.toastDeleteFailed"), "danger");
    } finally {
      setBusyPath(null);
    }
  };

  const clearAll = async () => {
    if (!window.confirm(formatMessage({ id: "history.confirmClearAll" }))) return;
    setClearing(true);
    try {
      await deleteHistory();
      toast(formatMessage({ id: "history.toastClearedAll" }));
      setPage(1);
      load(1);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t("history.toastClearFailed"), "danger");
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
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight">{formatMessage({ id: "nav.history" })}</h1>
          <p className="text-sm text-stone-500 mt-1">{formatMessage({ id: "history.subtitle" })}</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-secondary btn-sm" disabled={loading} onClick={() => load(page)}>
            <Icon name="refresh-cw" className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            {formatMessage({ id: "common.refresh" })}
          </button>
          <button
            className="btn btn-secondary btn-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
            disabled={clearing || data.count === 0}
            onClick={clearAll}
          >
            <Icon name="trash-2" className="w-3.5 h-3.5" />
            {formatMessage({ id: "history.clearAll" })}
          </button>
        </div>
      </div>

      {error && (
        <div className="card flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-red-200 bg-red-50">
          <div className="flex items-center gap-2 text-sm text-red-700">
            <Icon name="alert-circle" className="w-4 h-4 shrink-0" />
            {formatMessage({ id: "history.errBanner" }, { error })}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => load(page)}>
            {formatMessage({ id: "common.retry" })}
          </button>
        </div>
      )}

      {/* stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-stone-500">{formatMessage({ id: "history.statTotal" })}</p>
            <p className="text-2xl font-semibold tabular-nums mt-0.5">{fmtNum(data.count)}</p>
          </div>
          <span className="w-9 h-9 rounded-lg bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-600">
            <Icon name="clock" className="w-4 h-4" />
          </span>
        </div>
        <div className="card px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-stone-500">{formatMessage({ id: "history.statPageDuration" })}</p>
            <p className="text-2xl font-semibold tabular-nums mt-0.5">{fmtDurLong(pageDuration / 1000)}</p>
          </div>
          <span className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <Icon name="video" className="w-4 h-4" />
          </span>
        </div>
        <div className="card px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-stone-500">{formatMessage({ id: "history.statPageTraffic" })}</p>
            <p className="text-2xl font-semibold tabular-nums mt-0.5">{fmtBytes(pageInBytes)}</p>
          </div>
          <span className="w-9 h-9 rounded-lg bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600">
            <Icon name="trending-up" className="w-4 h-4" />
          </span>
        </div>
        <div className="card px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-stone-500">{formatMessage({ id: "history.statPageStreams" })}</p>
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
            placeholder={formatMessage({ id: "history.searchPlaceholder" })}
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
          <option value="">{formatMessage({ id: "streams.allProtocols" })}</option>
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
            <h3 className="font-semibold">{formatMessage({ id: "history.recordsTitle" })}</h3>
            <p className="text-xs text-stone-500 mt-0.5">
              {formatMessage({ id: "history.recordsSubtitle" }, { count: fmtNum(data.count) })}
            </p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>{formatMessage({ id: "common.stream" })}</th>
                <th>{formatMessage({ id: "common.protocol" })}</th>
                <th>{formatMessage({ id: "history.colIp" })}</th>
                <th>{formatMessage({ id: "common.startTime" })}</th>
                <th>{formatMessage({ id: "common.endTime" })}</th>
                <th>{formatMessage({ id: "common.duration" })}</th>
                <th>{formatMessage({ id: "history.colTraffic" })}</th>
                <th>{formatMessage({ id: "history.colPlays" })}</th>
                <th className="text-right">{formatMessage({ id: "common.actions" })}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9}>
                    <div className="flex items-center justify-center gap-2 py-14 text-stone-400">
                      <Icon name="refresh-cw" className="w-4 h-4 animate-spin" />
                      <span className="text-sm">{formatMessage({ id: "history.loading" })}</span>
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
                    <td className="text-stone-500">{fmtDateTime(h.startTime)}</td>
                    <td className="text-stone-500">{fmtDateTime(h.endTime)}</td>
                    <td className="tabular-nums">{fmtDur((h.duration ?? 0) / 1000)}</td>
                    <td className="tabular-nums">{fmtBytes(h.inBytes ?? 0)}</td>
                    <td className="tabular-nums">{fmtNum(h.playCount ?? 0)}</td>
                    <td>
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          className="btn btn-ghost btn-sm btn-icon"
                          title={formatMessage({ id: "history.copyPath" })}
                          onClick={() => {
                            navigator.clipboard?.writeText(h.streamPath).then(
                              () => toast(formatMessage({ id: "records.toastCopied" }, { text: h.streamPath })),
                              () => toast(h.streamPath)
                            );
                          }}
                        >
                          <Icon name="copy" className="w-3.5 h-3.5" />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm btn-icon text-red-600 hover:bg-red-50 disabled:opacity-50"
                          title={formatMessage({ id: "history.deleteStream" })}
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
                        {formatMessage({ id: search || fProto ? "history.emptyFiltered" : "history.empty" })}
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
              {formatMessage({ id: "common.pageInfo" }, { page: data.page, pages: totalPages })}
            </span>
            <div className="flex gap-2">
              <button
                className="btn btn-secondary btn-sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                {formatMessage({ id: "common.prevPage" })}
              </button>
              <button
                className="btn btn-secondary btn-sm"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                {formatMessage({ id: "common.nextPage" })}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
