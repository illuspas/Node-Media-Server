import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../components/Icon";
import { fmtBytes, fmtDur, fmtDurLong } from "../lib/format";
import { toast } from "../lib/toast";
import {
  ApiError,
  deleteRecord,
  deleteSession,
  fetchRecords,
} from "../lib/api";
import type { ApiRecord, RecordsPage } from "../lib/api";

const POLL_ACTIVE_MS = 3000;
const POLL_FILES_MS = 10000;
const PAGE_SIZE = 20;

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleString("zh-CN", { hour12: false });
}

function fileBaseName(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx >= 0 ? path.slice(idx + 1) : path;
}

export default function Records() {
  const [active, setActive] = useState<ApiRecord[]>([]);
  const [files, setFiles] = useState<RecordsPage>({
    items: [], count: 0, page: 1, pageSize: PAGE_SIZE, totalDuration: 0, totalSize: 0,
  });
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadFiles = useCallback(async (targetPage: number) => {
    try {
      const body = await fetchRecords({ status: "done", page: targetPage, pageSize: PAGE_SIZE });
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
      setError(err instanceof ApiError ? err.message : "加载录像列表失败");
    }
  }, []);

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
      toast("该记录缺少推流会话信息，无法远程停止", "danger");
      return;
    }
    setBusyId(rec.id);
    try {
      await deleteSession(rec.publisherId);
      toast(`已断开 ${rec.streamPath} 的推流，录像即将完成`);
      setTimeout(loadActive, 500);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "停止录制失败", "danger");
    } finally {
      setBusyId(null);
    }
  };

  const removeFile = async (rec: ApiRecord) => {
    if (!window.confirm(`删除录像 ${fileBaseName(rec.filePath)}？磁盘上的文件也会一并删除。`)) return;
    setBusyId(rec.id);
    try {
      await deleteRecord(rec.id, true);
      toast(`已删除 ${fileBaseName(rec.filePath)}`);
      const remaining = files.count - 1;
      if (remaining > 0 && (files.items?.length ?? 0) === 1 && page > 1) {
        setPage(page - 1);
      } else {
        loadFiles(page);
      }
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "删除失败", "danger");
    } finally {
      setBusyId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(files.count / PAGE_SIZE));

  return (
    <main className="p-4 md:p-6 max-w-[1440px] mx-auto space-y-4 md:space-y-6">
      {/* header */}
      <div>
        <h1 className="text-xl md:text-2xl font-semibold tracking-tight">流录像</h1>
        <p className="text-sm text-stone-500 mt-1">在线录制、归档与管理所有录像文件</p>
      </div>

      {error && (
        <div className="card px-5 py-3 text-sm text-red-600 border-red-200">{error}</div>
      )}

      {/* stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-stone-500">录制中任务</p>
            <p className="text-2xl font-semibold tabular-nums mt-0.5">{active.length}</p>
          </div>
          <span className="w-9 h-9 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center text-red-500">
            <Icon name="disc" className="w-4 h-4" />
          </span>
        </div>
        <div className="card px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-stone-500">归档文件</p>
            <p className="text-2xl font-semibold tabular-nums mt-0.5">{files.count}</p>
          </div>
          <span className="w-9 h-9 rounded-lg bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-600">
            <Icon name="film" className="w-4 h-4" />
          </span>
        </div>
        <div className="card px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-stone-500">累计录制时长</p>
            <p className="text-2xl font-semibold tabular-nums mt-0.5">{fmtDurLong(files.totalDuration / 1000)}</p>
          </div>
          <span className="w-9 h-9 rounded-lg bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-600">
            <Icon name="clock" className="w-4 h-4" />
          </span>
        </div>
        <div className="card px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-stone-500">录像总大小</p>
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
            <h3 className="font-semibold">正在录制</h3>
            <p className="text-xs text-stone-500 mt-0.5">每 3 秒自动刷新</p>
          </div>
          <span className="badge badge-danger">LIVE</span>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>流</th>
                <th>已录时长</th>
                <th>开始时间</th>
                <th>状态</th>
                <th className="text-right">操作</th>
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
                    <td className="text-stone-500">{fmtTime(t.startTime)}</td>
                    <td>
                      <span className="badge badge-danger">
                        <span className="dot-live" style={{ width: 6, height: 6, background: "#ef4444", animation: "none" }} />
                        &nbsp;录制中
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-secondary btn-sm text-red-600 disabled:opacity-50"
                        disabled={busyId === t.id}
                        onClick={() => stopRecording(t)}
                      >
                        <Icon name="square" className="w-3 h-3" />
                        停止录制
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>
                    <div className="flex flex-col items-center justify-center py-14 text-stone-400">
                      <Icon name="disc" className="w-8 h-8 mb-2" />
                      <span className="text-sm">当前没有正在录制的流</span>
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
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
          <div>
            <h3 className="font-semibold">录像文件库</h3>
            <p className="text-xs text-stone-500 mt-0.5">共 {files.count} 个文件，按录制时间倒序</p>
          </div>
          <Link to="/settings" className="text-sm text-stone-500 hover:text-neutral-900 inline-flex items-center gap-1 transition-colors">
            录制设置 <Icon name="arrow-right" className="w-3.5 h-3.5" />
          </Link>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>文件名</th>
                <th>所属流</th>
                <th>大小</th>
                <th>时长</th>
                <th>录制时间</th>
                <th className="text-right">操作</th>
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
                    <td className="text-stone-500">{fmtTime(f.startTime)}</td>
                    <td>
                      <div className="flex items-center gap-0.5">
                        <button
                          className="btn btn-ghost btn-sm btn-icon"
                          title="复制文件路径"
                          onClick={() => {
                            navigator.clipboard?.writeText(f.filePath).then(
                              () => toast(`已复制：${f.filePath}`),
                              () => toast(f.filePath)
                            );
                          }}
                        >
                          <Icon name="download" className="w-3.5 h-3.5" />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm btn-icon text-red-600 hover:bg-red-50 disabled:opacity-50"
                          title="删除（含磁盘文件）"
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
                      <Icon name="film" className="w-8 h-8 mb-2" />
                      <span className="text-sm">还没有已完成的录像</span>
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
              第 {files.page} / {totalPages} 页
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
