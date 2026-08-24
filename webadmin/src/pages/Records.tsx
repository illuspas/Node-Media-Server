import { useCallback, useEffect, useState } from "react";
import { useIntl } from "react-intl";
import Icon from "../components/Icon";
import { fmtBytes, fmtDur, fmtDurLong, fmtDateTime } from "../lib/format";
import { toast } from "../lib/toast";
import { t } from "../i18n";
import {
  ApiError,
  deleteRecord,
  deleteSession,
  downloadRecord,
  fetchRecords,
} from "../lib/api";
import type { ApiRecord, RecordsPage } from "../lib/api";
import { presetDates, rangeWindow, type RangeValue } from "../lib/timerange";

const POLL_ACTIVE_MS = 3000;
const POLL_FILES_MS = 10000;
const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

function fileBaseName(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx >= 0 ? path.slice(idx + 1) : path;
}

export default function Records() {
  const { formatMessage } = useIntl();
  const [active, setActive] = useState<ApiRecord[]>([]);
  const [files, setFiles] = useState<RecordsPage>({
    items: [], count: 0, page: 1, pageSize: PAGE_SIZE, totalDuration: 0, totalSize: 0,
  });
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [fRange, setFRange] = useState<RangeValue>("7d");
  /* the date boxes always show the active window; presets rewrite them */
  const [customStart, setCustomStart] = useState(() => presetDates("7d").start);
  const [customEnd, setCustomEnd] = useState(() => presetDates("7d").end);

  const loadFiles = useCallback(async (targetPage: number) => {
    try {
      const body = await fetchRecords({
        status: "done",
        search: search || undefined,
        page: targetPage,
        pageSize: PAGE_SIZE,
        ...rangeWindow(fRange, customStart, customEnd),
      });
      setFiles({
        items: body.items ?? [],
        count: body.count ?? 0,
        page: body.page ?? targetPage,
        pageSize: body.pageSize ?? PAGE_SIZE,
        totalDuration: body.totalDuration ?? 0,
        totalSize: body.totalSize ?? 0,
      });
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("records.errLoad"));
    }
  }, [search, fRange, customStart, customEnd]);

  /* debounce the search box into a server-side query */
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(q.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  const loadActive = useCallback(async () => {
    try {
      const body = await fetchRecords({ status: "recording", pageSize: 100 });
      setActive(body.items ?? []);
    } catch {
      /* transient polling errors keep the previous snapshot */
    }
  }, []);

  useEffect(() => {
    loadActive();
    const iv = setInterval(loadActive, POLL_ACTIVE_MS);
    return () => clearInterval(iv);
  }, [loadActive]);

  useEffect(() => {
    loadFiles(page);
    const iv = setInterval(() => loadFiles(page), POLL_FILES_MS);
    return () => clearInterval(iv);
  }, [loadFiles, page]);

  /** Stop the recording by kicking its publisher; the record finalizes itself. */
  const stopRecording = async (rec: ApiRecord) => {
    if (!rec.publisherId) {
      toast(formatMessage({ id: "records.noPublisher" }), "danger");
      return;
    }
    setBusyId(rec.id);
    try {
      await deleteSession(rec.publisherId);
      toast(formatMessage({ id: "records.toastStopped" }, { path: rec.streamPath }));
      setTimeout(loadActive, 500);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t("records.toastStopFailed"), "danger");
    } finally {
      setBusyId(null);
    }
  };

  const removeFile = async (rec: ApiRecord) => {
    if (!window.confirm(formatMessage({ id: "records.confirmDeleteFile" }, { name: fileBaseName(rec.filePath) }))) return;
    setBusyId(rec.id);
    try {
      await deleteRecord(rec.id, true);
      toast(formatMessage({ id: "records.toastDeleted" }, { name: fileBaseName(rec.filePath) }));
      const remaining = files.count - 1;
      if (remaining > 0 && (files.items?.length ?? 0) === 1 && page > 1) {
        setPage(page - 1);
      } else {
        loadFiles(page);
      }
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t("records.toastDeleteFailed"), "danger");
    } finally {
      setBusyId(null);
    }
  };

  /** Download the recording file. */
  const downloadFile = async (rec: ApiRecord) => {
    setBusyId(rec.id);
    try {
      await downloadRecord(rec.id, fileBaseName(rec.filePath));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t("records.toastDownloadFailed"), "danger");
    } finally {
      setBusyId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(files.count / PAGE_SIZE));

  return (
    <main className="p-4 md:p-6 max-w-[1440px] mx-auto space-y-4 md:space-y-6">
      {/* header */}
      <div>
        <h1 className="text-xl md:text-2xl font-semibold tracking-tight">{formatMessage({ id: "nav.records" })}</h1>
        <p className="text-sm text-stone-500 mt-1">{formatMessage({ id: "records.subtitle" })}</p>
      </div>

      {error && (
        <div className="card px-5 py-3 text-sm text-red-600 border-red-200">{error}</div>
      )}

      {/* stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-stone-500">{formatMessage({ id: "records.statActive" })}</p>
            <p className="text-2xl font-semibold tabular-nums mt-0.5">{active.length}</p>
          </div>
          <span className="w-9 h-9 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center text-red-500">
            <Icon name="disc" className="w-4 h-4" />
          </span>
        </div>
        <div className="card px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-stone-500">{formatMessage({ id: "records.statFiles" })}</p>
            <p className="text-2xl font-semibold tabular-nums mt-0.5">{files.count}</p>
          </div>
          <span className="w-9 h-9 rounded-lg bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-600">
            <Icon name="film" className="w-4 h-4" />
          </span>
        </div>
        <div className="card px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-stone-500">{formatMessage({ id: "records.statDuration" })}</p>
            <p className="text-2xl font-semibold tabular-nums mt-0.5">{fmtDurLong(files.totalDuration / 1000)}</p>
          </div>
          <span className="w-9 h-9 rounded-lg bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-600">
            <Icon name="clock" className="w-4 h-4" />
          </span>
        </div>
        <div className="card px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-stone-500">{formatMessage({ id: "records.statSize" })}</p>
            <p className="text-2xl font-semibold tabular-nums mt-0.5">{fmtBytes(files.totalSize)}</p>
          </div>
          <span className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
            <Icon name="hard-drive" className="w-4 h-4" />
          </span>
        </div>
      </div>

      {/* active tasks */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
          <div>
            <h3 className="font-semibold">{formatMessage({ id: "records.activeTitle" })}</h3>
            <p className="text-xs text-stone-500 mt-0.5">{formatMessage({ id: "records.activeSubtitle" })}</p>
          </div>
          <span className="badge badge-danger">LIVE</span>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>{formatMessage({ id: "common.stream" })}</th>
                <th>{formatMessage({ id: "records.colRecorded" })}</th>
                <th>{formatMessage({ id: "common.startTime" })}</th>
                <th>{formatMessage({ id: "common.status" })}</th>
                <th className="text-right">{formatMessage({ id: "common.actions" })}</th>
              </tr>
            </thead>
            <tbody>
              {active.length ? (
                active.map(t => (
                  <tr key={t.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-2 self-stretch rounded-full bg-red-500" />
                        <div>
                          <div className="font-medium">{t.name}</div>
                          <div className="text-xs text-stone-400 font-mono">{t.streamPath}</div>
                        </div>
                      </div>
                    </td>
                    <td className="tabular-nums">{fmtDur((Date.now() - t.startTime) / 1000)}</td>
                    <td className="text-stone-500">{fmtDateTime(t.startTime)}</td>
                    <td>
                      <span className="badge badge-danger">
                        <span className="dot-live" style={{ width: 6, height: 6, background: "#ef4444", animation: "none" }} />
                        &nbsp;{formatMessage({ id: "records.recording" })}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-secondary btn-sm text-red-600 disabled:opacity-50"
                        disabled={busyId === t.id}
                        onClick={() => stopRecording(t)}
                      >
                        <Icon name="square" className="w-3 h-3" />
                        {formatMessage({ id: "records.stopRecording" })}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>
                    <div className="flex flex-col items-center justify-center py-14 text-stone-400">
                      <Icon name="disc" className="w-8 h-8 mb-2" />
                      <span className="text-sm">{formatMessage({ id: "records.emptyActive" })}</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* files */}
      <div className="card overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-5 py-4 border-b border-stone-200">
          <div>
            <h3 className="font-semibold">{formatMessage({ id: "records.libraryTitle" })}</h3>
            <p className="text-xs text-stone-500 mt-0.5">
              {formatMessage({ id: "records.librarySubtitle" }, { count: files.count })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-44">
              <Icon name="search" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
              <input
                className="input h-10 text-sm"
                style={{ paddingLeft: "2.25rem" }}
                placeholder={formatMessage({ id: "records.searchPlaceholder" })}
                value={q}
                onChange={e => setQ(e.target.value)}
              />
            </div>
            <div className="flex rounded-lg border border-stone-200 bg-stone-50 p-0.5 h-10">
              {(["today", "7d", "30d", "custom"] as const).map(v => (
                <button
                  key={v}
                  className={`h-full px-3 text-sm rounded-[0.45rem] transition-colors ${
                    fRange === v
                      ? "bg-white border border-stone-200 text-stone-900 shadow-sm font-medium"
                      : "text-stone-500 hover:text-stone-800"
                  }`}
                  onClick={() => {
                    setFRange(v);
                    if (v !== "custom") {
                      const { start, end } = presetDates(v);
                      setCustomStart(start);
                      setCustomEnd(end);
                    }
                    setPage(1);
                  }}
                >
                  {formatMessage({ id: `history.range.${v}` })}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                className="input h-10 text-sm"
                value={customStart}
                onChange={e => {
                  setCustomStart(e.target.value);
                  setFRange("custom");
                  setPage(1);
                }}
              />
              <span className="text-stone-400">–</span>
              <input
                type="date"
                className="input h-10 text-sm"
                value={customEnd}
                onChange={e => {
                  setCustomEnd(e.target.value);
                  setFRange("custom");
                  setPage(1);
                }}
              />
            </div>
          </div>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>{formatMessage({ id: "records.colFile" })}</th>
                <th>{formatMessage({ id: "records.colOwner" })}</th>
                <th>{formatMessage({ id: "records.colSize" })}</th>
                <th>{formatMessage({ id: "common.duration" })}</th>
                <th>{formatMessage({ id: "records.colTime" })}</th>
                <th className="text-right">{formatMessage({ id: "common.actions" })}</th>
              </tr>
            </thead>
            <tbody>
              {files.items.length ? (
                files.items.map(f => (
                  <tr key={f.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="event-ic">
                          <Icon name="film" />
                        </div>
                        <span className="font-mono text-xs">{fileBaseName(f.filePath)}</span>
                      </div>
                    </td>
                    <td className="text-stone-500 font-mono text-xs">{f.streamPath}</td>
                    <td className="tabular-nums">{fmtBytes(f.size)}</td>
                    <td className="tabular-nums">{fmtDur(f.duration / 1000)}</td>
                    <td className="text-stone-500">{fmtDateTime(f.startTime)}</td>
                    <td>
                      <div className="flex items-center gap-0.5">
                        <button
                          className="btn btn-ghost btn-sm btn-icon"
                          title={formatMessage({ id: "records.download" })}
                          disabled={busyId === f.id}
                          onClick={() => downloadFile(f)}
                        >
                          <Icon name="download" className="w-3.5 h-3.5" />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm btn-icon text-red-600 hover:bg-red-50 disabled:opacity-50"
                          title={formatMessage({ id: "records.deleteFile" })}
                          disabled={busyId === f.id}
                          onClick={() => removeFile(f)}
                        >
                          <Icon name="trash-2" className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>
                    <div className="flex flex-col items-center justify-center py-14 text-stone-400">
                      <Icon name={search ? "search" : "film"} className="w-8 h-8 mb-2" />
                      <span className="text-sm">
                        {formatMessage({ id: search ? "records.emptyFiltered" : "records.emptyFiles" })}
                      </span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {files.count > PAGE_SIZE && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-stone-200 text-sm">
            <span className="text-stone-500">
              {formatMessage({ id: "common.pageInfo" }, { page: files.page, pages: totalPages })}
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
