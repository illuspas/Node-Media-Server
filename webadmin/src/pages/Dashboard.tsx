import { useCallback, useEffect, useRef, useState } from "react";
import Chart from "chart.js/auto";
import type { Chart as ChartType, Plugin } from "chart.js";
import Icon from "../components/Icon";
import CountUp from "../components/CountUp";
import { fetchStats } from "../lib/api";
import type { ApiStats } from "../lib/api";
import { fmtNum, fmtDur, fmtBytes } from "../lib/format";

const POLL_INTERVAL = 5000;
/** Rolling window for the trend chart: 72 samples ≈ 6 minutes at 5s polls. */
const TREND_POINTS = 72;

interface DashEvent {
  id: number;
  icon: string;
  text: string;
  time: string;
}

const centerTextPlugin: Plugin<"doughnut"> = {
  id: "centerText",
  afterDraw(chart) {
    const { ctx, chartArea } = chart;
    const x = (chartArea.left + chartArea.right) / 2;
    const y = (chartArea.top + chartArea.bottom) / 2;
    const total = (chart as unknown as { $nmsSessions?: number }).$nmsSessions ?? 0;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 20px Inter";
    ctx.fillStyle = "#1c1917";
    ctx.fillText(fmtNum(total), x, y - 8);
    ctx.font = "11px Inter";
    ctx.fillStyle = "#a8a29e";
    ctx.fillText("总会话数", x, y + 12);
    ctx.restore();
  }
};

export default function Dashboard() {
  const [stats, setStats] = useState<ApiStats | null>(null);
  const [receivedAt, setReceivedAt] = useState(() => Date.now());
  const [cpuPct, setCpuPct] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clock, setClock] = useState(() => new Date().toLocaleString("zh-CN", { hour12: false }));
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [events, setEvents] = useState<DashEvent[]>([]);

  const prevCpuRef = useRef<{ user: number; system: number; t: number } | null>(null);
  const cpuPctRef = useRef<number | null>(null);
  const prevCountsRef = useRef<{ publishers: number; players: number } | null>(null);
  const eventIdRef = useRef(1);

  const trendCanvasRef = useRef<HTMLCanvasElement>(null);
  const mixCanvasRef = useRef<HTMLCanvasElement>(null);
  const trendChartRef = useRef<ChartType<"line"> | null>(null);
  const mixChartRef = useRef<ChartType<"doughnut"> | null>(null);

  const pushEvent = useCallback((icon: string, text: string) => {
    setEvents(prev =>
      [
        { id: eventIdRef.current++, icon, text, time: new Date().toTimeString().slice(0, 8) },
        ...prev
      ].slice(0, 20)
    );
  }, []);

  const load = useCallback(async () => {
    try {
      const s = await fetchStats();
      setStats(s);
      setReceivedAt(Date.now());
      setError(null);

      /* process CPU% = Δ(cpuUsage μs) / Δ(elapsed μs) × 100 */
      const sample = { user: s.cpu.user, system: s.cpu.system, t: Date.now() };
      const prev = prevCpuRef.current;
      if (prev && sample.t > prev.t) {
        const busyUs = sample.user + sample.system - prev.user - prev.system;
        const elapsedUs = (sample.t - prev.t) * 1000;
        const pct = Math.max(0, (busyUs / elapsedUs) * 100);
        cpuPctRef.current = pct;
        setCpuPct(pct);
      }
      prevCpuRef.current = sample;

      /* diff publisher/player counts into a session-scoped event feed */
      const counts = { publishers: s.sessions.publishers, players: s.sessions.players };
      const prevCounts = prevCountsRef.current;
      if (!prevCounts) {
        pushEvent("activity", `监控已连接 · ${s.sessions.publishers} 路流 · ${s.sessions.total} 个会话`);
      } else {
        const dStreams = counts.publishers - prevCounts.publishers;
        const dPlayers = counts.players - prevCounts.players;
        if (dStreams > 0) pushEvent("video", `检测到 ${dStreams} 路新推流（共 ${counts.publishers} 路）`);
        if (dStreams < 0) pushEvent("video", `${-dStreams} 路推流已结束（剩 ${counts.publishers} 路）`);
        if (dPlayers > 0) pushEvent("users", `${dPlayers} 个播放端接入（共 ${counts.players} 个）`);
        if (dPlayers < 0) pushEvent("users", `${-dPlayers} 个播放端断开（剩 ${counts.players} 个）`);
      }
      prevCountsRef.current = counts;

      /* append a point to the trend chart */
      const chart = trendChartRef.current;
      if (chart) {
        const label = new Date().toTimeString().slice(0, 8);
        chart.data.labels?.push(label);
        (chart.data.datasets[0].data as (number | null)[]).push(s.sessions.total);
        (chart.data.datasets[1].data as (number | null)[]).push(cpuPctRef.current ?? null);
        while ((chart.data.labels?.length ?? 0) > TREND_POINTS) {
          chart.data.labels?.shift();
          chart.data.datasets.forEach(d => d.data.shift());
        }
        chart.update("none");
      }
      const mix = mixChartRef.current;
      if (mix) {
        mix.data.datasets[0].data = [s.sessions.publishers, s.sessions.players];
        (mix as unknown as { $nmsSessions?: number }).$nmsSessions = s.sessions.total;
        mix.update("none");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载统计数据失败");
    } finally {
      setLoading(false);
    }
  }, [pushEvent]);

  /* clock (also drives the smooth uptime display) */
  useEffect(() => {
    const iv = setInterval(() => {
      setClock(new Date().toLocaleString("zh-CN", { hour12: false }));
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  /* charts (created once, fed by load()) */
  useEffect(() => {
    Chart.defaults.font.family = 'Inter, "PingFang SC", "Microsoft YaHei", sans-serif';
    Chart.defaults.font.size = 11;
    Chart.defaults.color = "#a8a29e";

    if (trendCanvasRef.current) {
      trendChartRef.current = new Chart(trendCanvasRef.current, {
        type: "line",
        data: {
          labels: [],
          datasets: [
            {
              label: "会话数",
              data: [],
              borderColor: "#171717",
              borderWidth: 2,
              pointRadius: 0,
              tension: 0.35,
              yAxisID: "y",
              fill: true,
              backgroundColor: "rgba(23,23,23,.06)"
            },
            {
              label: "CPU %",
              data: [],
              borderColor: "#a8a29e",
              borderWidth: 1.5,
              borderDash: [4, 3],
              pointRadius: 0,
              tension: 0.35,
              yAxisID: "y1"
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          spanGaps: true,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: {
              position: "bottom",
              labels: { usePointStyle: true, pointStyle: "circle", boxWidth: 6, boxHeight: 6, padding: 14 }
            },
            tooltip: {
              backgroundColor: "#1c1917",
              padding: 10,
              cornerRadius: 8,
              displayColors: false,
              callbacks: { label: c => ` ${c.dataset.label}：${c.parsed.y ?? "—"}` }
            }
          },
          scales: {
            x: { grid: { display: false }, ticks: { maxTicksLimit: 6, maxRotation: 0 } },
            y: { grid: { color: "#f0efee" }, border: { display: false }, beginAtZero: true, ticks: { precision: 0 } },
            y1: {
              position: "right",
              grid: { display: false },
              border: { display: false },
              beginAtZero: true,
              suggestedMax: 100,
              ticks: { callback: v => `${v}%` }
            }
          }
        }
      });
    }

    if (mixCanvasRef.current) {
      const chart = new Chart(mixCanvasRef.current, {
        type: "doughnut",
        data: {
          labels: ["发布端", "播放端"],
          datasets: [
            {
              data: [0, 0],
              backgroundColor: ["#171717", "#a8a29e"],
              borderColor: "#fff",
              borderWidth: 3,
              hoverOffset: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "70%",
          plugins: {
            legend: {
              position: "bottom",
              labels: { usePointStyle: true, pointStyle: "circle", boxWidth: 6, boxHeight: 6, padding: 16 }
            },
            tooltip: {
              backgroundColor: "#1c1917",
              padding: 10,
              cornerRadius: 8,
              callbacks: { label: c => ` ${c.label}：${c.parsed} 个会话` }
            }
          }
        },
        plugins: [centerTextPlugin]
      });
      mixChartRef.current = chart;
    }

    return () => {
      trendChartRef.current?.destroy();
      trendChartRef.current = null;
      mixChartRef.current?.destroy();
      mixChartRef.current = null;
    };
  }, []);

  /* poll the API, paused while the tab is hidden */
  useEffect(() => {
    // Fetch-on-mount is a legitimate external-system sync; every setState in
    // load() runs after the awaited response, never synchronously.
    // oxlint-disable-next-line react/set-state-in-effect
    void load();
    const poll = setInterval(() => {
      if (!document.hidden) void load();
    }, POLL_INTERVAL);
    return () => clearInterval(poll);
  }, [load]);

  /* uptime ticks smoothly between polls, derived from the 1s clock state */
  const uptime = stats ? stats.server.uptime + (nowMs - receivedAt) / 1000 : 0;

  const mem = stats?.memory;
  const infoRows: { label: string; value: string; mono?: boolean }[] = stats
    ? [
        { label: "运行时长", value: fmtDur(uptime) },
        { label: "Node.js 版本", value: stats.server.nodeVersion, mono: true },
        { label: "平台 / 架构", value: `${stats.server.platform} / ${stats.server.arch}`, mono: true },
        { label: "进程 PID", value: String(stats.server.pid), mono: true },
        { label: "常驻内存 (RSS)", value: fmtBytes(mem?.rss ?? 0) },
        { label: "堆内存", value: `${fmtBytes(mem?.heapUsed ?? 0)} / ${fmtBytes(mem?.heapTotal ?? 0)}` },
        { label: "累计接收流量 ↓", value: fmtBytes(stats.network.inBytes) },
        { label: "累计发送流量 ↑", value: fmtBytes(stats.network.outBytes) },
        { label: "数据采样时间", value: new Date(stats.timestamp).toLocaleString("zh-CN", { hour12: false }) }
      ]
    : [];

  return (
    <main className="p-4 md:p-6 max-w-[1440px] mx-auto space-y-4 md:space-y-6">
      {/* page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight">仪表盘</h1>
          <p className="text-sm text-stone-500 mt-1">实时掌握服务器与会话的运行状态</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-stone-400 tabular-nums hidden sm:inline">{clock}</span>
          <button className="btn btn-secondary btn-sm" disabled={loading} onClick={() => void load()}>
            <Icon name="refresh-cw" className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            刷新
          </button>
        </div>
      </div>

      {/* error banner */}
      {error && (
        <div className="card flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-red-200 bg-red-50">
          <div className="flex items-center gap-2 text-sm text-red-700">
            <Icon name="alert-circle" className="w-4 h-4 shrink-0" />
            统计数据加载失败：{error}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => void load()}>
            重试
          </button>
        </div>
      )}

      {/* stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-stone-500">在线流</p>
              <p className="text-3xl font-semibold tracking-tight tabular-nums mt-1">
                <CountUp value={stats?.sessions.publishers ?? 0} />
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-stone-100 border border-stone-200/70 flex items-center justify-center text-stone-600">
              <Icon name="video" className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-stone-500 mt-3">
            <Icon name="layers" className="w-3 h-3" />
            会话总数 {stats?.sessions.total ?? 0}（发布 {stats?.sessions.publishers ?? 0} · 播放 {stats?.sessions.players ?? 0}）
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-stone-500">播放端会话</p>
              <p className="text-3xl font-semibold tracking-tight tabular-nums mt-1">
                <CountUp value={stats?.sessions.players ?? 0} />
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-stone-100 border border-stone-200/70 flex items-center justify-center text-stone-600">
              <Icon name="users" className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-stone-500 mt-3">
            <Icon name="radio" className="w-3 h-3" />
            发布端会话 {stats?.sessions.publishers ?? 0} 个
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-stone-500">进程 CPU</p>
              <p className="text-3xl font-semibold tracking-tight tabular-nums mt-1">
                {cpuPct === null ? "—" : <CountUp value={cpuPct} format={v => v.toFixed(1)} />}
                {cpuPct !== null && <span className="text-base font-medium text-stone-400 ml-1">%</span>}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-stone-100 border border-stone-200/70 flex items-center justify-center text-stone-600">
              <Icon name="cpu" className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-stone-500 mt-3">
            <Icon name="activity" className="w-3 h-3" />
            Node {stats?.server.nodeVersion ?? "—"} · 采样间隔 {POLL_INTERVAL / 1000}s
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-stone-500">内存占用</p>
              <p className="text-3xl font-semibold tracking-tight tabular-nums mt-1" style={{ fontSize: "1.55rem" }}>
                {mem ? fmtBytes(mem.rss) : "—"}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-stone-100 border border-stone-200/70 flex items-center justify-center text-stone-600">
              <Icon name="database" className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-stone-500 mt-3">
            <Icon name="layers" className="w-3 h-3" />
            堆内存 {fmtBytes(mem?.heapUsed ?? 0)} / {fmtBytes(mem?.heapTotal ?? 0)} · PID {stats?.server.pid ?? "—"}
          </div>
        </div>
      </div>

      {/* charts */}
      <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
            <div>
              <h3 className="font-semibold">运行趋势</h3>
              <p className="text-xs text-stone-500 mt-0.5">会话数与进程 CPU · 每 {POLL_INTERVAL / 1000} 秒采样 · 页面开启期间累积</p>
            </div>
            <span className="badge badge-outline">
              <span className="dot-live" style={{ width: 6, height: 6 }} />
              &nbsp;实时
            </span>
          </div>
          <div className="p-5">
            <div style={{ height: 264 }}>
              <canvas ref={trendCanvasRef} />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="px-5 py-4 border-b border-stone-200">
            <h3 className="font-semibold">会话构成</h3>
            <p className="text-xs text-stone-500 mt-0.5">按当前连接的会话类型统计</p>
          </div>
          <div className="p-5">
            <div style={{ height: 264 }}>
              <canvas ref={mixCanvasRef} />
            </div>
          </div>
        </div>
      </div>

      {/* system info + events */}
      <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
        <div className="card overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
            <div>
              <h3 className="font-semibold">系统信息</h3>
              <p className="text-xs text-stone-500 mt-0.5">来自 /api/v1/stats 的服务器运行时指标</p>
            </div>
            {stats && <span className="badge badge-success">
              <span className="dot-live" style={{ width: 6, height: 6 }} />
              &nbsp;运行中
            </span>}
          </div>
          <div className="px-5 py-2 divide-y divide-stone-100">
            {infoRows.length ? (
              infoRows.map(row => (
                <div key={row.label} className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-stone-600">{row.label}</span>
                  <span className={`text-sm ${row.mono ? "font-mono text-[13px]" : ""} tabular-nums`}>{row.value}</span>
                </div>
              ))
            ) : (
              <div className="flex items-center justify-center gap-2 py-12 text-stone-400">
                <Icon name="refresh-cw" className="w-4 h-4 animate-spin" />
                <span className="text-sm">正在加载统计数据…</span>
              </div>
            )}
          </div>
          <div className="px-5 py-3 border-t border-stone-200 bg-stone-50/70 text-xs text-stone-500 flex items-center justify-between">
            <span>
              CPU {cpuPct === null ? "—" : `${cpuPct.toFixed(1)}%`} · 内存 {fmtBytes(mem?.rss ?? 0)}
            </span>
            <span>已运行 {stats ? fmtDur(uptime) : "—"}</span>
          </div>
        </div>

        {/* recent events */}
        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
            <h3 className="font-semibold">最近事件</h3>
            <span className="badge badge-outline">
              <span className="dot-live" style={{ width: 6, height: 6 }} />
              &nbsp;实时
            </span>
          </div>
          <div className="px-5 py-4 space-y-4">
            {events.length ? (
              events.map(ev => (
                <div key={ev.id} className="flex items-start gap-3">
                  <div className="event-ic">
                    <Icon name={ev.icon} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm leading-snug">{ev.text}</p>
                    <p className="text-xs text-stone-400 mt-1">{ev.time}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-stone-400">
                <Icon name="inbox" className="w-8 h-8 mb-2" />
                <span className="text-sm">等待事件…</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
