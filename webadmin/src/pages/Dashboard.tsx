import { useEffect, useRef, useState } from "react";
import Chart from "chart.js/auto";
import type { Chart as ChartType, Plugin, ScriptableContext } from "chart.js";
import Icon from "../components/Icon";
import CountUp from "../components/CountUp";
import { STREAMS, STREAM_STATUS } from "../lib/mock";
import type { Stream } from "../lib/mock";
import { fmtNum, fmtDur, rnd } from "../lib/format";
import { toast } from "../lib/toast";

function egressOf(streams: Stream[]): number {
  return (
    streams.filter(s => s.status === "online").reduce((a, s) => a + s.bitrate, 0) / 1000 * 9.75
  );
}

const centerTextPlugin: Plugin<"doughnut"> = {
  id: "centerText",
  afterDraw(chart) {
    const { ctx, chartArea } = chart;
    const x = (chartArea.left + chartArea.right) / 2;
    const y = (chartArea.top + chartArea.bottom) / 2;
    const viewers = (chart as unknown as { $nmsViewers?: number }).$nmsViewers ?? 0;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 20px Inter";
    ctx.fillStyle = "#1c1917";
    ctx.fillText(fmtNum(viewers), x, y - 8);
    ctx.font = "11px Inter";
    ctx.fillStyle = "#a8a29e";
    ctx.fillText("总观看请求", x, y + 12);
    ctx.restore();
  }
};

export default function Dashboard() {
  const [streams, setStreams] = useState<Stream[]>(() => STREAMS.map(s => ({ ...s })));
  const [cpu, setCpu] = useState(23);
  const [clock, setClock] = useState(() => new Date().toLocaleString("zh-CN", { hour12: false }));

  const bwCanvasRef = useRef<HTMLCanvasElement>(null);
  const protoCanvasRef = useRef<HTMLCanvasElement>(null);
  const bwChartRef = useRef<ChartType<"line"> | null>(null);
  const protoChartRef = useRef<ChartType<"doughnut"> | null>(null);
  const bwChartReadyRef = useRef(false);

  /* clock */
  useEffect(() => {
    const iv = setInterval(() => setClock(new Date().toLocaleString("zh-CN", { hour12: false })), 1000);
    return () => clearInterval(iv);
  }, []);

  /* charts (created once) */
  useEffect(() => {
    Chart.defaults.font.family = 'Inter, "PingFang SC", "Microsoft YaHei", sans-serif';
    Chart.defaults.font.size = 11;
    Chart.defaults.color = "#a8a29e";

    const now = Date.now();
    const bwLabels: string[] = [];
    const bwSeries: number[] = [];
    for (let i = 29; i >= 0; i--) {
      const t = new Date(now - i * 30000);
      bwLabels.push(t.toTimeString().slice(0, 5));
      bwSeries.push(egressOf(streams) + Math.sin(i / 4) * 18 + rnd(-12, 12));
    }

    if (bwCanvasRef.current) {
      bwChartRef.current = new Chart(bwCanvasRef.current, {
        type: "line",
        data: {
          labels: bwLabels,
          datasets: [
            {
              label: "出口带宽 (Mbps)",
              data: bwSeries,
              borderColor: "#171717",
              borderWidth: 2,
              pointRadius: 0,
              tension: 0.35,
              fill: true,
              backgroundColor: (c: ScriptableContext<"line">) => {
                const g = c.chart.ctx.createLinearGradient(0, 0, 0, 260);
                g.addColorStop(0, "rgba(23,23,23,.10)");
                g.addColorStop(1, "rgba(23,23,23,0)");
                return g;
              }
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "#1c1917",
              padding: 10,
              cornerRadius: 8,
              displayColors: false,
              callbacks: { label: c => ` ${Number(c.parsed.y ?? 0).toFixed(1)} Mbps` }
            }
          },
          scales: {
            x: { grid: { display: false }, ticks: { maxTicksLimit: 6 } },
            y: { grid: { color: "#f0efee" }, border: { display: false }, beginAtZero: true }
          }
        }
      });
    }

    if (protoCanvasRef.current) {
      const chart = new Chart(protoCanvasRef.current, {
        type: "doughnut",
        data: {
          labels: ["HTTP-FLV", "HLS", "RTMP", "WebRTC"],
          datasets: [
            {
              data: [42, 31, 19, 8],
              backgroundColor: ["#171717", "#57534e", "#a8a29e", "#d6d3d1"],
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
              callbacks: { label: c => ` ${c.label}：${c.parsed}%` }
            }
          }
        },
        plugins: [centerTextPlugin]
      });
      (chart as unknown as { $nmsViewers?: number }).$nmsViewers = streams.reduce((a, s) => a + s.viewers, 0);
      protoChartRef.current = chart;
    }

    bwChartReadyRef.current = false;
    return () => {
      bwChartRef.current?.destroy();
      bwChartRef.current = null;
      protoChartRef.current?.destroy();
      protoChartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* live stats */
  useEffect(() => {
    const iv = setInterval(() => {
      setStreams(prev =>
        prev.map(s =>
          s.status === "online"
            ? {
                ...s,
                bitrate: Math.max(300, s.bitrate + rnd(-120, 140)),
                viewers: Math.max(0, Math.round(s.viewers + rnd(-8, 14))),
                dur: s.dur + 2
              }
            : s
        )
      );
      setCpu(v => Math.min(92, Math.max(8, v + rnd(-3, 3.2))));
    }, 2000);
    return () => clearInterval(iv);
  }, []);

  /* feed the bandwidth chart with each new streams snapshot */
  useEffect(() => {
    if (!bwChartRef.current) return;
    if (!bwChartReadyRef.current) {
      bwChartReadyRef.current = true; // skip the initial snapshot already seeded above
      return;
    }
    const chart = bwChartRef.current;
    chart.data.labels?.push(new Date().toTimeString().slice(0, 5));
    chart.data.labels?.shift();
    const data = chart.data.datasets[0].data as number[];
    data.push(egressOf(streams) + rnd(-8, 8));
    data.shift();
    chart.update("none");
  }, [streams]);

  const onlineCount = streams.filter(s => s.status === "online").length;
  const totalViewers = streams.reduce((a, s) => a + s.viewers, 0);
  const egress = egressOf(streams);
  const topStreams = streams
    .filter(s => s.status === "online")
    .toSorted((a, b) => b.viewers - a.viewers)
    .slice(0, 6);

  return (
    <main className="p-4 md:p-6 max-w-[1440px] mx-auto space-y-4 md:space-y-6">
      {/* page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight">仪表盘</h1>
          <p className="text-sm text-stone-500 mt-1">实时掌握服务器与所有流的运行状态</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-stone-400 tabular-nums hidden sm:inline">{clock}</span>
          <button className="btn btn-secondary btn-sm" onClick={() => toast("监控数据已刷新")}>
            <Icon name="refresh-cw" className="w-3.5 h-3.5" />
            刷新
          </button>
        </div>
      </div>

      {/* stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-stone-500">在线流</p>
              <p className="text-3xl font-semibold tracking-tight tabular-nums mt-1">
                <CountUp value={onlineCount} />
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-stone-100 border border-stone-200/70 flex items-center justify-center text-stone-600">
              <Icon name="video" className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-stone-500 mt-3">
            <span className="inline-flex items-center gap-0.5 text-emerald-600 font-medium">
              <Icon name="trending-up" className="w-3 h-3" />
              12.4%
            </span>
            较昨日同期
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-stone-500">总观众数</p>
              <p className="text-3xl font-semibold tracking-tight tabular-nums mt-1">
                <CountUp value={totalViewers} />
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-stone-100 border border-stone-200/70 flex items-center justify-center text-stone-600">
              <Icon name="users" className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-stone-500 mt-3">
            <span className="inline-flex items-center gap-0.5 text-emerald-600 font-medium">
              <Icon name="trending-up" className="w-3 h-3" />
              8.2%
            </span>
            较昨日同期
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-stone-500">出口带宽</p>
              <p className="text-3xl font-semibold tracking-tight tabular-nums mt-1">
                <CountUp value={egress} format={v => v.toFixed(1)} />
                <span className="text-base font-medium text-stone-400 ml-1">Mbps</span>
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-stone-100 border border-stone-200/70 flex items-center justify-center text-stone-600">
              <Icon name="activity" className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-stone-500 mt-3">
            <span className="inline-flex items-center gap-0.5 text-red-500 font-medium">
              <Icon name="trending-down" className="w-3 h-3" />
              2.1%
            </span>
            较昨日同期
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-stone-500">CPU 使用率</p>
              <p className="text-3xl font-semibold tracking-tight tabular-nums mt-1">
                <CountUp value={cpu} format={v => `${Math.round(v)}%`} />
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-stone-100 border border-stone-200/70 flex items-center justify-center text-stone-600">
              <Icon name="cpu" className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-stone-500 mt-3">
            <span className="inline-flex items-center gap-0.5 text-emerald-600 font-medium">
              <Icon name="trending-down" className="w-3 h-3" />
              3.2%
            </span>
            负载平稳
          </div>
        </div>
      </div>

      {/* charts */}
      <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
            <div>
              <h3 className="font-semibold">带宽监控</h3>
              <p className="text-xs text-stone-500 mt-0.5">近 15 分钟实时采样 · 每 30 秒一个数据点</p>
            </div>
            <span className="badge badge-outline">
              <span className="dot-live" style={{ width: 6, height: 6 }} />
              &nbsp;实时
            </span>
          </div>
          <div className="p-5">
            <div style={{ height: 264 }}>
              <canvas ref={bwCanvasRef} />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="px-5 py-4 border-b border-stone-200">
            <h3 className="font-semibold">播放协议分布</h3>
            <p className="text-xs text-stone-500 mt-0.5">按当前观众请求数统计</p>
          </div>
          <div className="p-5">
            <div style={{ height: 264 }}>
              <canvas ref={protoCanvasRef} />
            </div>
          </div>
        </div>
      </div>

      {/* active streams + side column */}
      <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
            <div>
              <h3 className="font-semibold">活跃流</h3>
              <p className="text-xs text-stone-500 mt-0.5">正在推流的会话 · 按观众数排序</p>
            </div>
            <a
              href="#/streams"
              className="text-sm text-stone-500 hover:text-neutral-900 inline-flex items-center gap-1 transition-colors"
            >
              查看全部 <Icon name="arrow-right" className="w-3.5 h-3.5" />
            </a>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>流</th>
                  <th>码率</th>
                  <th>观众</th>
                  <th>时长</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {topStreams.map(s => (
                  <tr key={`${s.app}/${s.name}`}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-stone-100 border border-stone-200/60 flex items-center justify-center text-stone-500 shrink-0">
                          <Icon name="video" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium truncate" style={{ maxWidth: 200 }}>
                            {s.title}
                          </div>
                          <div className="text-xs text-stone-400 font-mono">
                            {s.app}/{s.name}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="tabular-nums">{(s.bitrate / 1000).toFixed(2)} Mbps</td>
                    <td className="tabular-nums">{fmtNum(s.viewers)}</td>
                    <td className="tabular-nums">{fmtDur(s.dur)}</td>
                    <td>
                      <span className={`badge ${STREAM_STATUS[s.status].cls}`}>
                        <span className="dot-live" style={{ width: 6, height: 6 }} />
                        &nbsp;{STREAM_STATUS[s.status].label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4 md:space-y-6">
          {/* service status */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
              <div>
                <h3 className="font-semibold">服务状态</h3>
                <p className="text-xs text-stone-500 mt-0.5">全部组件运行正常</p>
              </div>
              <span className="badge badge-success">正常</span>
            </div>
            <div className="px-5 py-2 divide-y divide-stone-100">
              {[
                { label: "RTMP 服务", port: ":1935" },
                { label: "HTTP 服务", port: ":8000" },
                { label: "HTTP-FLV", port: ":8000/live" },
                { label: "HLS 切片", port: ":8000/hls" },
                { label: "WebSocket-FLV", port: ":8000/ws" }
              ].map(svc => (
                <div key={svc.label} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="dot-live" />
                    <span className="text-sm font-medium">{svc.label}</span>
                  </div>
                  <span className="text-xs text-stone-400 font-mono">{svc.port}</span>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-stone-200 bg-stone-50/70 text-xs text-stone-500 flex items-center justify-between">
              <span>CPU 23% · 内存 512 MB</span>
              <span>已运行 14 天 6 小时</span>
            </div>
          </div>

          {/* recent events */}
          <div className="card">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
              <h3 className="font-semibold">最近事件</h3>
              <span className="badge badge-outline">实时</span>
            </div>
            <div className="px-5 py-4 space-y-4">
              {[
                { icon: "video", text: "「新年音乐会现场」开始推流（SRT · 8500 kbps）", time: "2 分钟前" },
                { icon: "zap", text: "转发任务「欧冠赛事分发」已启动", time: "18 分钟前" },
                { icon: "users", text: "流 lol_pro_01 观众数突破 5,000", time: "32 分钟前" },
                { icon: "disc", text: "录制文件 concert_live_20250612.mp4 已归档", time: "1 小时前" },
                { icon: "alert-circle", text: "检测到 stream_001 码率波动，已自动恢复", time: "3 小时前" }
              ].map(ev => (
                <div key={ev.text} className="flex items-start gap-3">
                  <div className="event-ic">
                    <Icon name={ev.icon} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm leading-snug">{ev.text}</p>
                    <p className="text-xs text-stone-400 mt-1">{ev.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
