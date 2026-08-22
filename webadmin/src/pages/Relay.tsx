import { useEffect, useState } from "react";
import Icon from "../components/Icon";
import { APP_NAMES, RELAY_TASKS } from "../lib/mock";
import type { RelayTask } from "../lib/mock";
import { rnd, rndInt, nowHM } from "../lib/format";
import { toast } from "../lib/toast";

interface RelayForm {
  type: "push" | "pull";
  name: string;
  app: string;
  stream: string;
  dst: string;
}

const EMPTY_FORM: RelayForm = { type: "push", name: "", app: "live", stream: "", dst: "" };

export default function Relay() {
  const [tasks, setTasks] = useState<RelayTask[]>(() => RELAY_TASKS.map(t => ({ ...t })));
  const [form, setForm] = useState<RelayForm>(EMPTY_FORM);
  const [totalBytes, setTotalBytes] = useState(128.4);

  useEffect(() => {
    const iv = setInterval(() => setTotalBytes(v => v + rnd(0.02, 0.09)), 3000);
    return () => clearInterval(iv);
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.stream.trim() || !form.dst.trim()) {
      toast("请完整填写任务信息", "warning");
      return;
    }
    const name = form.name.trim();
    const sname = form.stream.trim();
    const dst = form.dst.trim();
    setTasks(prev => [
      {
        id: `T-${rndInt(1000, 9999)}`,
        name,
        type: form.type,
        src: form.type === "push" ? `${form.app}/${sname}` : dst,
        dst: form.type === "push" ? dst : `${form.app}/${sname}`,
        status: "stopped",
        time: nowHM()
      },
      ...prev
    ]);
    toast("转发任务创建成功");
    setForm({ ...EMPTY_FORM, type: form.type });
  };

  const toggle = (id: string) => {
    setTasks(prev =>
      prev.map(t => {
        if (t.id !== id) return t;
        const status = t.status === "running" ? "stopped" : "running";
        toast(status === "running" ? `任务「${t.name}」已启动` : `任务「${t.name}」已停止`);
        return { ...t, status, time: nowHM() };
      })
    );
  };

  const remove = (id: string) => {
    const t = tasks.find(x => x.id === id);
    setTasks(prev => prev.filter(x => x.id !== id));
    toast(`任务「${t?.name ?? id}」已删除`, "danger");
  };

  const running = tasks.filter(t => t.status === "running").length;

  return (
    <main className="p-4 md:p-6 max-w-[1440px] mx-auto space-y-4 md:space-y-6">
      {/* header */}
      <div>
        <h1 className="text-xl md:text-2xl font-semibold tracking-tight">流转发</h1>
        <p className="text-sm text-stone-500 mt-1">将本机流推送到外部平台，或从远端源拉回流进行分发</p>
      </div>

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
            <p className="text-xs text-stone-500">已停止任务</p>
            <p className="text-2xl font-semibold tabular-nums mt-0.5">{tasks.length - running}</p>
          </div>
          <span className="w-9 h-9 rounded-lg bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-600">
            <Icon name="power" className="w-4 h-4" />
          </span>
        </div>
        <div className="card px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-stone-500">累计转发流量</p>
            <p className="text-2xl font-semibold tabular-nums mt-0.5">{totalBytes.toFixed(1)} GB</p>
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
                className={`seg-btn flex-1 justify-center ${form.type === "push" ? "active" : ""}`}
                onClick={() => setForm(f => ({ ...f, type: "push" }))}
              >
                <Icon name="corner-up-right" className="w-3.5 h-3.5" />
                推流转发
              </button>
              <button
                type="button"
                className={`seg-btn flex-1 justify-center ${form.type === "pull" ? "active" : ""}`}
                onClick={() => setForm(f => ({ ...f, type: "pull" }))}
              >
                <Icon name="corner-down-left" className="w-3.5 h-3.5" />
                拉流代理
              </button>
            </div>
          </div>

          <div className="mb-4">
            <label className="label" htmlFor="r-name">任务名称</label>
            <input
              id="r-name"
              className="input"
              placeholder="例：欧冠赛事分发"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div className="mb-4">
            <label className="label" htmlFor="r-app">本机应用（app）</label>
            <select
              id="r-app"
              className="select"
              value={form.app}
              onChange={e => setForm(f => ({ ...f, app: e.target.value }))}
            >
              {APP_NAMES.map(a => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label className="label" htmlFor="r-stream">流名称（name）</label>
            <input
              id="r-stream"
              className="input font-mono"
              placeholder="例：stream_001"
              value={form.stream}
              onChange={e => setForm(f => ({ ...f, stream: e.target.value }))}
            />
          </div>

          <div className="mb-4">
            <label className="label" htmlFor="r-dst">RTMP 地址</label>
            <input
              id="r-dst"
              className="input font-mono text-xs"
              placeholder="rtmp://cdn.example.com/live/key"
              value={form.dst}
              onChange={e => setForm(f => ({ ...f, dst: e.target.value }))}
            />
            <p className="help">推流转发时填写目标地址；拉流代理时填写远端源地址。</p>
          </div>

          <div className="flex gap-2 pt-1">
            <button type="submit" className="btn btn-primary flex-1">
              添加任务
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setForm(f => ({ ...f, name: "", stream: "", dst: "" }))}>
              重置
            </button>
          </div>
        </form>

        {/* tasks table */}
        <div className="card overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
            <div>
              <h3 className="font-semibold">转发任务</h3>
              <p className="text-xs text-stone-500 mt-0.5">任务的启动与停止会实时下发到 Node-Media-Server</p>
            </div>
            <span className="badge badge-outline">{tasks.length} 条任务</span>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>任务</th>
                  <th>类型</th>
                  <th>转发路径</th>
                  <th>状态</th>
                  <th>更新时间</th>
                  <th className="text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {tasks.length ? (
                  tasks.map(t => (
                    <tr key={t.id}>
                      <td>
                        <div className="font-medium">{t.name}</div>
                        <div className="text-xs text-stone-400 font-mono">{t.id}</div>
                      </td>
                      <td>
                        <span className={`badge ${t.type === "push" ? "badge-neutral" : "badge-info"}`}>
                          <Icon name={t.type === "push" ? "corner-up-right" : "corner-down-left"} className="w-3 h-3" />
                          {t.type === "push" ? "推流转发" : "拉流代理"}
                        </span>
                      </td>
                      <td>
                        <div className="text-xs text-stone-400">{t.src}</div>
                        <div className="text-xs text-stone-500 flex items-center gap-1 mt-0.5">
                          <Icon name="corner-down-right" className="w-3 h-3" />
                          <span className="truncate" style={{ maxWidth: 240 }} title={t.dst}>
                            {t.dst}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${t.status === "running" ? "badge-success" : "badge-neutral"}`}>
                          {t.status === "running" ? (
                            <>
                              <span className="dot-live" style={{ width: 6, height: 6 }} />
                              &nbsp;运行中
                            </>
                          ) : (
                            "已停止"
                          )}
                        </span>
                      </td>
                      <td className="text-stone-500 tabular-nums text-xs">{t.time}</td>
                      <td>
                        <div className="flex items-center gap-0.5">
                          <button
                            className="btn btn-ghost btn-sm btn-icon"
                            title={t.status === "running" ? "停止" : "启动"}
                            onClick={() => toggle(t.id)}
                          >
                            <Icon name={t.status === "running" ? "power" : "play"} className="w-3.5 h-3.5" />
                          </button>
                          <button
                            className="btn btn-ghost btn-sm btn-icon text-red-600 hover:bg-red-50"
                            title="删除"
                            onClick={() => remove(t.id)}
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
                        <Icon name="inbox" className="w-8 h-8 mb-2" />
                        <span className="text-sm">暂无转发任务</span>
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
