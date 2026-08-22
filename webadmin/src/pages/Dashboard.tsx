import { useCallback, useEffect, useRef, useState } from "react";
import Chart from "chart.js/auto";
import type { Chart as ChartType } from "chart.js";
import Icon from "../components/Icon";
import CountUp from "../components/CountUp";
import { fetchStats } from "../lib/api";
import type { ApiStats } from "../lib/api";
import { fmtBytes } from "../lib/format";

const POLL_INTERVAL = 2000;
/** Rolling window for the bandwidth chart: 150 samples ≈ 5 minutes at 2s polls. */
const NET_POINTS = 150;

export default function Dashboard() {
  const [stats, setStats] = useState<ApiStats | null>(null);
  const [cpuPct, setCpuPct] = useState<number | null>(null);
  const [netMbps, setNetMbps] = useState<{ in: number; out: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clock, setClock] = useState(() => new Date().toLocaleString("zh-CN", { hour12: false }));

  const prevCpuRef = useRef<{ user: number; system: number; t: number } | null>(null);
  const cpuPctRef = useRef<number | null>(null);
  const prevNetRef = useRef<{ inBytes: number; outBytes: number; t: number } | null>(null);
  const netRef = useRef<{ in: number; out: number } | null>(null);

  const netCanvasRef = useRef<HTMLCanvasElement>(null);
  const netChartRef = useRef<ChartType<"line"> | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await fetchStats();
      setStats(s);
      setError(null);

      /* process CPU% = Δ(cpuUsage μs) / Δ(elapsed μs) × 100 */
      const cpuSample = { user: s.cpu.user, system: s.cpu.system, t: Date.now() };
      const prevCpu = prevCpuRef.current;
      if (prevCpu && cpuSample.t > prevCpu.t) {
        const busyUs = cpuSample.user + cpuSample.system - prevCpu.user - prevCpu.system;
        const elapsedUs = (cpuSample.t - prevCpu.t) * 1000;
        const pct = Math.max(0, (busyUs / elapsedUs) * 100);
        cpuPctRef.current = pct;
        setCpuPct(pct);
      }
      prevCpuRef.current = cpuSample;

      /* bandwidth = Δ(cumulative bytes) × 8 / Δt, in Mbps */
      const netSample = { inBytes: s.network.inBytes, outBytes: s.network.outBytes, t: Date.now() };
      const prevNet = prevNetRef.current;
      if (prevNet && netSample.t > prevNet.t) {
        const sec = (netSample.t - prevNet.t) / 1000;
        const mbps = {
          in: Math.max(0, ((netSample.inBytes - prevNet.inBytes) * 8) / sec / 1e6),
          out: Math.max(0, ((netSample.outBytes - prevNet.outBytes) * 8) / sec / 1e6)
        };
        netRef.current = mbps;
        setNetMbps(mbps);
      }
      prevNetRef.current = netSample;

      /* append a point to the bandwidth chart */
      const chart = netChartRef.current;
      if (chart) {
        chart.data.labels?.push(new Date().toTimeString().slice(0, 8));
        (chart.data.datasets[0].data as (number | null)[]).push(netRef.current?.in ?? null);
        (chart.data.datasets[1].data as (number | null)[]).push(netRef.current?.out ?? null);
        while ((chart.data.labels?.length ?? 0) > NET_POINTS) {
          chart.data.labels?.shift();
          chart.data.datasets.forEach(d => d.data.shift());
        }
        chart.update("none");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载统计数据失败");
    } finally {
      setLoading(false);
    }
  }, []);

  /* clock */
  useEffect(() => {
    const iv = setInterval(() => setClock(new Date().toLocaleString("zh-CN", { hour12: false })), 1000);
    return () => clearInterval(iv);
  }, []);

  /* charts (created once, fed by load()) */
  useEffect(() => {
    Chart.defaults.font.family = 'Inter, "PingFang SC", "Microsoft YaHei", sans-serif';
    Chart.defaults.font.size = 11;
    Chart.defaults.color = "#a8a29e";

    if (netCanvasRef.current) {
      netChartRef.current = new Chart(netCanvasRef.current, {
        type: "line",
        data: {
          labels: [],
          datasets: [
            {
              label: "接收 Mbps",
              data: [],
              borderColor: "#171717",
              borderWidth: 2,
              pointRadius: 0,
              tension: 0.35,
              fill: true,
              backgroundColor: "rgba(23,23,23,.06)"
            },
            {
              label: "发送 Mbps",
              data: [],
              borderColor: "#a8a29e",
              borderWidth: 1.5,
              borderDash: [4, 3],
              pointRadius: 0,
              tension: 0.35
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
              callbacks: { label: c => ` ${c.dataset.label}：${(c.parsed.y ?? 0).toFixed(2)} Mbps` }
            }
          },
          scales: {
            x: { grid: { display: false }, ticks: { maxTicksLimit: 6, maxRotation: 0 } },
            y: {
              grid: { color: "#f0efee" },
              border: { display: false },
              beginAtZero: true,
              ticks: { callback: v => `${v} Mbps` }
            }
          }
        }
      });
    }

    return () => {
      netChartRef.current?.destroy();
      netChartRef.current = null;
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

  const mem = stats?.memory;

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

      {/* bandwidth chart */}
      <div className="card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
          <div>
            <h3 className="font-semibold">网络用量</h3>
            <p className="text-xs text-stone-500 mt-0.5">
              {netMbps
                ? `↓ ${netMbps.in.toFixed(1)} / ↑ ${netMbps.out.toFixed(1)} Mbps · 累计 ↓${fmtBytes(stats?.network.inBytes ?? 0)} ↑${fmtBytes(stats?.network.outBytes ?? 0)}`
                : `每 ${POLL_INTERVAL / 1000} 秒采样 · 约 5 分钟滚动窗口`}
            </p>
          </div>
          <span className="badge badge-outline">
            <span className="dot-live" style={{ width: 6, height: 6 }} />
            &nbsp;实时
          </span>
        </div>
        <div className="p-5">
          <div style={{ height: 264 }}>
            <canvas ref={netCanvasRef} />
          </div>
        </div>
      </div>
    </main>
  );
}
