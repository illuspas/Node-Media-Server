import { useCallback, useEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";
import Chart from "chart.js/auto";
import type { Chart as ChartType } from "chart.js";
import Icon from "../components/Icon";
import CountUp from "../components/CountUp";
import { fetchStats } from "../lib/api";
import type { ApiStats } from "../lib/api";
import { fmtBytes } from "../lib/format";
import { t } from "../i18n";

const POLL_INTERVAL = 2000;
/** Rolling window for the bandwidth chart: 150 samples ≈ 5 minutes at 2s polls. */
const NET_POINTS = 150;

export default function Dashboard() {
  const intl = useIntl();
  const { formatMessage, locale } = intl;
  const [stats, setStats] = useState<ApiStats | null>(null);
  const [cpuPct, setCpuPct] = useState<number | null>(null);
  const [netMbps, setNetMbps] = useState<{ in: number; out: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

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
      setError(e instanceof Error ? e.message : t("dashboard.errLoad"));
    } finally {
      setLoading(false);
    }
  }, []);

  /* clock */
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  /* charts (created once, fed by load(); labels follow the locale effect) */
  useEffect(() => {
    Chart.defaults.font.family = 'Inter, "PingFang SC", "Microsoft YaHei", sans-serif';
    Chart.defaults.font.size = 11;
    Chart.defaults.color = "#a8a29e";

    // oxlint-disable-next-line react-hooks/exhaustive-deps
    if (netCanvasRef.current) {
      netChartRef.current = new Chart(netCanvasRef.current, {
        type: "line",
        data: {
          labels: [],
          datasets: [
            {
              label: formatMessage({ id: "dashboard.chart.in" }),
              data: [],
              borderColor: "#171717",
              borderWidth: 2,
              pointRadius: 0,
              tension: 0.35,
              fill: true,
              backgroundColor: "rgba(23,23,23,.06)"
            },
            {
              label: formatMessage({ id: "dashboard.chart.out" }),
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
              callbacks: {
                label: c =>
                  formatMessage(
                    { id: "dashboard.chart.tooltip" },
                    { label: c.dataset.label ?? "", value: (c.parsed.y ?? 0).toFixed(2) }
                  )
              }
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
    // The chart instance lives for the component lifetime; label text is
    // refreshed by the locale effect below instead of rebuilding the chart.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* keep chart labels and tooltip in the active locale */
  useEffect(() => {
    const chart = netChartRef.current;
    if (!chart) return;
    chart.data.datasets[0].label = formatMessage({ id: "dashboard.chart.in" });
    chart.data.datasets[1].label = formatMessage({ id: "dashboard.chart.out" });
    chart.options.plugins!.tooltip!.callbacks!.label = c =>
      formatMessage(
        { id: "dashboard.chart.tooltip" },
        { label: c.dataset.label ?? "", value: (c.parsed.y ?? 0).toFixed(2) }
      );
    chart.update("none");
  }, [locale, formatMessage]);

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
  const clockLocale = locale === "zh-CN" ? "zh-CN" : "en-US";

  return (
    <main className="p-4 md:p-6 max-w-[1440px] mx-auto space-y-4 md:space-y-6">
      {/* page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight">{formatMessage({ id: "dashboard.title" })}</h1>
          <p className="text-sm text-stone-500 mt-1">{formatMessage({ id: "dashboard.subtitle" })}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-stone-400 tabular-nums hidden sm:inline">
            {now.toLocaleString(clockLocale, { hour12: false })}
          </span>
          <button className="btn btn-secondary btn-sm" disabled={loading} onClick={() => void load()}>
            <Icon name="refresh-cw" className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            {formatMessage({ id: "common.refresh" })}
          </button>
        </div>
      </div>

      {/* error banner */}
      {error && (
        <div className="card flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-red-200 bg-red-50">
          <div className="flex items-center gap-2 text-sm text-red-700">
            <Icon name="alert-circle" className="w-4 h-4 shrink-0" />
            {formatMessage({ id: "dashboard.errBanner" }, { error })}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => void load()}>
            {formatMessage({ id: "common.retry" })}
          </button>
        </div>
      )}

      {/* stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-stone-500">{formatMessage({ id: "dashboard.onlineStreams" })}</p>
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
            {formatMessage(
              { id: "dashboard.sessionsMeta" },
              {
                total: stats?.sessions.total ?? 0,
                publishers: stats?.sessions.publishers ?? 0,
                players: stats?.sessions.players ?? 0
              }
            )}
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-stone-500">{formatMessage({ id: "dashboard.playerSessions" })}</p>
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
            {formatMessage({ id: "dashboard.publisherSessionsMeta" }, { count: stats?.sessions.publishers ?? 0 })}
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-stone-500">{formatMessage({ id: "dashboard.processCpu" })}</p>
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
            {formatMessage(
              { id: "dashboard.cpuMeta" },
              { version: stats?.server.nodeVersion ?? "—", sec: POLL_INTERVAL / 1000 }
            )}
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-stone-500">{formatMessage({ id: "dashboard.memory" })}</p>
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
            {formatMessage(
              { id: "dashboard.heapMeta" },
              {
                used: fmtBytes(mem?.heapUsed ?? 0),
                total: fmtBytes(mem?.heapTotal ?? 0),
                pid: stats?.server.pid ?? "—"
              }
            )}
          </div>
        </div>
      </div>

      {/* bandwidth chart */}
      <div className="card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
          <div>
            <h3 className="font-semibold">{formatMessage({ id: "dashboard.netUsage" })}</h3>
            <p className="text-xs text-stone-500 mt-0.5">
              {netMbps
                ? formatMessage(
                    { id: "dashboard.netMeta" },
                    {
                      in: netMbps.in.toFixed(1),
                      out: netMbps.out.toFixed(1),
                      inTotal: fmtBytes(stats?.network.inBytes ?? 0),
                      outTotal: fmtBytes(stats?.network.outBytes ?? 0)
                    }
                  )
                : formatMessage({ id: "dashboard.netMetaIdle" }, { sec: POLL_INTERVAL / 1000 })}
            </p>
          </div>
          <span className="badge badge-outline">
            <span className="dot-live" style={{ width: 6, height: 6 }} />
            &nbsp;{formatMessage({ id: "dashboard.live" })}
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
