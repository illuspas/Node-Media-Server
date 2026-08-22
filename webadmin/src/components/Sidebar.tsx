import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import Icon from "./Icon";
import { fetchStats } from "../lib/api";
import { fmtDurLong } from "../lib/format";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

/** Footer refresh cadence; uptime needs no per-second precision. */
const FOOTER_POLL = 30000;

interface NavLinkItem {
  to: string;
  label: string;
  icon: string;
}

const NAV_GROUPS: { section: string; links: NavLinkItem[] }[] = [
  {
    section: "监控",
    links: [{ to: "/", label: "仪表盘", icon: "layout" }]
  },
  {
    section: "流管理",
    links: [
      { to: "/streams", label: "流列表", icon: "video" },
      { to: "/relay", label: "流转发", icon: "repeat" },
      { to: "/records", label: "流录像", icon: "disc" }
    ]
  },
  {
    section: "系统",
    links: [{ to: "/settings", label: "系统设置", icon: "settings" }]
  }
];

export default function Sidebar({ open, onClose }: SidebarProps) {
  const [foot, setFoot] = useState<{ connected: boolean; uptime: number } | null>(null);

  /* keep the footer status block on real /stats data */
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const s = await fetchStats();
        if (alive) setFoot({ connected: true, uptime: s.server.uptime });
      } catch {
        if (alive) setFoot(prev => (prev ? { ...prev, connected: false } : prev));
      }
    };
    // Fetch-on-mount syncs with an external system; setState happens after the await.
    // oxlint-disable-next-line react/set-state-in-effect
    void tick();
    const iv = setInterval(() => {
      if (!document.hidden) void tick();
    }, FOOTER_POLL);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  return (
    <div className={open ? "sb-root open" : "sb-root"}>
      <div className="sb-overlay" onClick={onClose} />
      <aside className="sb-sidebar">
        <div className="sb-brand">
          <div className="sb-logo">
            <Icon name="radio" />
          </div>
          <div>
            <div className="sb-brand-name">NMS Console</div>
            <div className="sb-brand-sub">Node-Media-Server</div>
          </div>
          <button className="sb-close" title="收起菜单" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <nav className="sb-nav">
          {NAV_GROUPS.map(g => (
            <div key={g.section}>
              <div className="sb-section">{g.section}</div>
              {g.links.map(l => (
                <NavLink key={l.to} to={l.to} end={l.to === "/"} className={({ isActive }) => (isActive ? "active" : "")} onClick={onClose}>
                  <Icon name={l.icon} />
                  <span>{l.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sb-foot">
          <div className="sb-foot-status">
            <span className={foot?.connected ? "sb-pulse" : "sb-pulse-off"} />
            {foot === null ? "正在连接服务…" : foot.connected ? "服务运行正常" : "服务连接失败"}
          </div>
          <div className="sb-foot-meta">
            {foot?.connected ? `已稳定运行 ${fmtDurLong(foot.uptime)}` : "Node-Media-Server"}
          </div>
        </div>
      </aside>
    </div>
  );
}
