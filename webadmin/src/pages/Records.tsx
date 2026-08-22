import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../components/Icon";
import { REC_FILES, REC_TASKS } from "../lib/mock";
import type { RecFile, RecTask } from "../lib/mock";
import { fmtDur, rnd } from "../lib/format";
import { toast } from "../lib/toast";

function fmtSize(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(0)} MB`;
}

export default function Records() {
  const [tasks, setTasks] = useState<RecTask[]>(() => REC_TASKS.map(t => ({ ...t })));
  const [files, setFiles] = useState<RecFile[]>(() => REC_FILES.map(f => ({ ...f })));
  const [usedGB, setUsedGB] = useState(642.1);

  /* live recording progress */
  useEffect(() => {
    const iv = setInterval(() => {
      setTasks(prev =>
        prev.map(t => ({
          ...t,
          dur: t.dur + 2,
          size: t.size + (t.bitrate / 8) * 2 / 1024
        }))
      );
      setUsedGB(v => v + rnd(0.002, 0.006));
    }, 2000);
    return () => clearInterval(iv);
  }, []);

  const stopRecording = (id: number) => {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    const ts = new Date();
    const stamp = `${String(ts.getMonth() + 1).padStart(2, "0")}${String(ts.getDate()).padStart(2, "0")}_${String(ts.getHours()).padStart(2, "0")}${String(ts.getMinutes()).padStart(2, "0")}${String(ts.getSeconds()).padStart(2, "0")}`;
    setFiles(prev => [
      {
        name: `${t.name}_${stamp}.${t.fmt.toLowerCase()}`,
        stream: `${t.app}/${t.name}`,
        fmt: t.fmt,
        size: t.size / 1024,
        dur: fmtDur(t.dur).padStart(8, "0"),
        time: "刚刚"
      },
      ...prev
    ]);
    setTasks(prev => prev.filter(x => x.id !== id));
    toast(`「${t.title}」录制完成，共 ${fmtSize(t.size)}`);
  };

  const removeFile = (name: string) => {
    setFiles(prev => prev.filter(f => f.name !== name));
    toast(`文件 ${name} 已删除`, "danger");
  };

  const pct = Math.min(100, (usedGB / 1024) * 100);

  return (
    <main className="p-4 md:p-6 max-w-[1440px] mx-auto space-y-4 md:space-y-6">
      {/* header */}
      <div>
        <h1 className="text-xl md:text-2xl font-semibold tracking-tight">流录像</h1>
        <p className="text-sm text-stone-500 mt-1">在线录制、归档与管理所有录像文件</p>
      </div>

      {/* stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-stone-500">录制中任务</p>
            <p className="text-2xl font-semibold tabular-nums mt-0.5">{tasks.length}</p>
          </div>
          <span className="w-9 h-9 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center text-red-500">
            <Icon name="disc" className="w-4 h-4" />
          </span>
        </div>
        <div className="card px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-stone-500">归档文件</p>
            <p className="text-2xl font-semibold tabular-nums mt-0.5">{files.length}</p>
          </div>
          <span className="w-9 h-9 rounded-lg bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-600">
            <Icon name="film" className="w-4 h-4" />
          </span>
        </div>
        <div className="card px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-stone-500">累计录制时长</p>
            <p className="text-2xl font-semibold tabular-nums mt-0.5">412 h</p>
          </div>
          <span className="w-9 h-9 rounded-lg bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-600">
            <Icon name="clock" className="w-4 h-4" />
          </span>
        </div>
        <div className="card px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-stone-500">磁盘使用率</p>
            <p className="text-2xl font-semibold tabular-nums mt-0.5">{pct.toFixed(1)}%</p>
          </div>
          <span className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
            <Icon name="hard-drive" className="w-4 h-4" />
          </span>
        </div>
      </div>

      {/* storage */}
      <div className="card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="font-semibold">存储空间</h3>
            <p className="text-xs text-stone-500 mt-0.5">录制目录：/media/records · 挂载于独立数据盘</p>
          </div>
          <span className="text-sm text-stone-500 tabular-nums">{usedGB.toFixed(1)} GB / 1 TB</span>
        </div>
        <div className="progress">
          <span style={{ width: `${pct.toFixed(1)}%` }} />
        </div>
        <p className="help mt-2">按当前写入速率，预计 5 天后写满。开启「磁盘满自动清理」可在空间不足时删除最早的录像。</p>
      </div>

      {/* active tasks */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
          <div>
            <h3 className="font-semibold">正在录制</h3>
            <p className="text-xs text-stone-500 mt-0.5">实时写入磁盘，每 2 秒刷新一次进度</p>
          </div>
          <span className="badge badge-danger">LIVE</span>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>流</th>
                <th>格式</th>
                <th>码率</th>
                <th>已录时长</th>
                <th>文件大小</th>
                <th>状态</th>
                <th className="text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {tasks.length ? (
                tasks.map(t => (
                  <tr key={t.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-2 self-stretch rounded-full bg-red-500" />
                        <div>
                          <div className="font-medium">{t.title}</div>
                          <div className="text-xs text-stone-400 font-mono">
                            {t.app}/{t.name}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-outline">{t.fmt}</span>
                    </td>
                    <td className="tabular-nums">{(t.bitrate / 1000).toFixed(1)} Mbps</td>
                    <td className="tabular-nums">{fmtDur(t.dur)}</td>
                    <td className="tabular-nums">{fmtSize(t.size)}</td>
                    <td>
                      <span className="badge badge-danger">
                        <span className="dot-live" style={{ width: 6, height: 6, background: "#ef4444", animation: "none" }} />
                        &nbsp;录制中
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-secondary btn-sm text-red-600" onClick={() => stopRecording(t.id)}>
                        <Icon name="square" className="w-3 h-3" />
                        停止录制
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7}>
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
            <p className="text-xs text-stone-500 mt-0.5">按录制时间倒序排列</p>
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
                <th>格式</th>
                <th>大小</th>
                <th>时长</th>
                <th>录制时间</th>
                <th className="text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {files.map(f => (
                <tr key={f.name}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="event-ic">
                        <Icon name="film" />
                      </div>
                      <span className="font-mono text-xs">{f.name}</span>
                    </div>
                  </td>
                  <td className="text-stone-500 font-mono text-xs">{f.stream}</td>
                  <td>
                    <span className="badge badge-outline">{f.fmt}</span>
                  </td>
                  <td className="tabular-nums">{f.size.toFixed(1)} GB</td>
                  <td className="tabular-nums">{f.dur}</td>
                  <td className="text-stone-500">{f.time}</td>
                  <td>
                    <div className="flex items-center gap-0.5">
                      <button className="btn btn-ghost btn-sm btn-icon" title="下载" onClick={() => toast(`开始下载 ${f.name}`)}>
                        <Icon name="download" className="w-3.5 h-3.5" />
                      </button>
                      <button
                        className="btn btn-ghost btn-sm btn-icon text-red-600 hover:bg-red-50"
                        title="删除"
                        onClick={() => removeFile(f.name)}
                      >
                        <Icon name="trash-2" className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
