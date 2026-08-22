import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../components/Icon";
import { APP_NAMES, STREAMS, STREAM_STATUS, posterUrl } from "../lib/mock";
import type { Stream } from "../lib/mock";
import { fmtNum, fmtDur } from "../lib/format";
import { toast } from "../lib/toast";

const PAGE_SIZE = 8;
const PROTOS = ["RTMP", "RTSP", "SRT", "HLS"];

export default function Streams() {
  const [list, setList] = useState<Stream[]>(() => STREAMS.map(s => ({ ...s })));
  const [q, setQ] = useState("");
  const [fApp, setFApp] = useState("");
  const [fProto, setFProto] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<Stream | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreview(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const filtered = list.filter(
    s =>
      (!q || (s.name + s.title + s.app).toLowerCase().includes(q.toLowerCase())) &&
      (!fApp || s.app === fApp) &&
      (!fProto || s.proto === fProto) &&
      (!fStatus || s.status === fStatus)
  );

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const curPage = Math.min(page, pages);
  const rows = filtered.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);

  const onlineCount = list.filter(s => s.status === "online").length;
  const idleCount = list.filter(s => s.status === "idle").length;
  const totalViewers = list.reduce((a, s) => a + s.viewers, 0);

  const toggleRec = (key: string) => {
    setList(prev =>
      prev.map(s => {
        if (`${s.app}/${s.name}` !== key) return s;
        const rec = !s.rec;
        toast(rec ? `已开始录制「${s.title}」` : `已停止录制「${s.title}」`);
        return { ...s, rec };
      })
    );
  };

  const kick = (key: string) => {
    const s = list.find(x => `${x.app}/${x.name}` === key);
    if (!s) return;
    setList(prev => prev.filter(x => `${x.app}/${x.name}` !== key));
    toast(`已断开流 ${key}`, "danger");
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
          <button className="btn btn-secondary btn-sm" onClick={() => toast("流列表已刷新")}>
            <Icon name="refresh-cw" className="w-3.5 h-3.5" />
            刷新
          </button>
          <Link to="/relay" className="btn btn-primary btn-sm">
            <Icon name="plus" className="w-3.5 h-3.5" />
            新建拉流
          </Link>
        </div>
      </div>

      {/* mini stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-stone-500">推流中</p>
            <p className="text-2xl font-semibold tabular-nums mt-0.5">{onlineCount}</p>
          </div>
          <span className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <Icon name="radio" className="w-4 h-4" />
          </span>
        </div>
        <div className="card px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-stone-500">待推送</p>
            <p className="text-2xl font-semibold tabular-nums mt-0.5">{idleCount}</p>
          </div>
          <span className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
            <Icon name="clock" className="w-4 h-4" />
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
      </div>

      {/* filters */}
      <div className="card p-4 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Icon name="search" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
          <input
            className="input"
            style={{ paddingLeft: "2.25rem" }}
            placeholder="搜索流名称 / 频道标题…"
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
          {APP_NAMES.map(a => (
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
          {PROTOS.map(p => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select
          className="select md:w-40"
          value={fStatus}
          onChange={e => {
            setFStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">全部状态</option>
          <option value="online">推流中</option>
          <option value="idle">待推送</option>
          <option value="offline">离线</option>
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
                <th>码率</th>
                <th>观众</th>
                <th>时长</th>
                <th>状态</th>
                <th className="text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map(s => {
                  const key = `${s.app}/${s.name}`;
                  return (
                    <tr key={key}>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-stone-100 border border-stone-200/60 flex items-center justify-center text-stone-500 shrink-0">
                            <Icon name="video" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium">{s.title}</div>
                            <div className="text-xs text-stone-400 font-mono">{key}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-outline">{s.app}</span>
                      </td>
                      <td>{s.proto}</td>
                      <td className="text-stone-500 font-mono text-xs">{s.ip}</td>
                      <td>
                        <div className="text-sm">
                          {s.res} · {s.fps}fps
                        </div>
                        <div className="text-xs text-stone-400">{s.codec}</div>
                      </td>
                      <td className="tabular-nums">{s.bitrate ? `${(s.bitrate / 1000).toFixed(2)} Mbps` : "—"}</td>
                      <td className="tabular-nums">{fmtNum(s.viewers)}</td>
                      <td className="tabular-nums">{s.dur ? fmtDur(s.dur) : "—"}</td>
                      <td>
                        <span className={`badge ${STREAM_STATUS[s.status].cls}`}>{STREAM_STATUS[s.status].label}</span>
                      </td>
                      <td>
                        <div className="flex items-center gap-0.5">
                          <button className="btn btn-ghost btn-sm btn-icon" title="预览" onClick={() => setPreview(s)}>
                            <Icon name="play" className="w-3.5 h-3.5" />
                          </button>
                          <button
                            className={`btn btn-ghost btn-sm btn-icon ${s.rec ? "text-emerald-600" : ""}`}
                            title="录制"
                            onClick={() => toggleRec(key)}
                          >
                            <Icon name="disc" className="w-3.5 h-3.5" />
                          </button>
                          <button
                            className="btn btn-ghost btn-sm btn-icon text-red-600 hover:bg-red-50"
                            title="断开"
                            onClick={() => kick(key)}
                          >
                            <Icon name="slash" className="w-3.5 h-3.5" />
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
                      <Icon name="wifi-off" className="w-8 h-8 mb-2" />
                      <span className="text-sm">未找到匹配的流</span>
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
              <h3 className="font-semibold">{preview?.title ?? "流预览"}</h3>
              <p className="text-xs text-stone-500 mt-0.5 font-mono">
                {preview ? `${preview.app}/${preview.name} · ${preview.proto}` : "—"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {preview?.status === "online" && (
                <span className="badge badge-success">
                  <span className="dot-live" style={{ width: 6, height: 6 }} />
                  &nbsp;推流中
                </span>
              )}
              <button className="btn btn-ghost btn-icon" title="关闭" onClick={() => setPreview(null)}>
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="relative bg-neutral-950">
            <img
              className="w-full aspect-video object-cover opacity-70"
              alt="stream preview"
              src={preview ? posterUrl(preview) : undefined}
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
                  {preview?.bitrate ? `${(preview.bitrate / 1000).toFixed(2)} Mbps` : "—"}
                </span>
                <span className="tabular-nums">{preview ? `${fmtNum(preview.viewers)} 观众` : "—"}</span>
              </div>
              <span className="tabular-nums">
                {preview ? `${preview.res} · ${preview.fps}fps · ${preview.codec}` : "—"}
              </span>
            </div>
          </div>
          <div className="px-5 py-3 bg-stone-50 border-t border-stone-200 text-xs text-stone-500 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <span>HTTP-FLV 播放地址</span>
            <code className="text-stone-600">{preview ? `http://demo.nms.io:8000/live/${preview.name}.flv` : "—"}</code>
          </div>
        </div>
      </div>
    </main>
  );
}
