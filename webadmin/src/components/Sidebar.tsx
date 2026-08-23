import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useIntl } from "react-intl";
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
  labelId: string;
  icon: string;
}

const NAV_GROUPS: { sectionId: string; links: NavLinkItem[] }[] = [
  {
    sectionId: "nav.section.monitor",
    links: [{ to: "/", labelId: "nav.dashboard", icon: "layout" }]
  },
  {
    sectionId: "nav.section.streams",
    links: [
      { to: "/streams", labelId: "nav.streams", icon: "video" },
      { to: "/relay", labelId: "nav.relay", icon: "repeat" },
      { to: "/records", labelId: "nav.records", icon: "disc" },
      { to: "/history", labelId: "nav.history", icon: "clock" }
    ]
  },
  {
    sectionId: "nav.section.system",
    links: [{ to: "/settings", labelId: "nav.settings", icon: "settings" }]
  }
];

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { formatMessage } = useIntl();
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
          <button className="sb-close" title={formatMessage({ id: "sidebar.closeMenu" })} onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <nav className="sb-nav">
          {NAV_GROUPS.map(g => (
            <div key={g.sectionId}>
              <div className="sb-section">{formatMessage({ id: g.sectionId })}</div>
              {g.links.map(l => (
                <NavLink key={l.to} to={l.to} end={l.to === "/"} className={({ isActive }) => (isActive ? "active" : "")} onClick={onClose}>
                  <Icon name={l.icon} />
                  <span>{formatMessage({ id: l.labelId })}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sb-foot">
          <div className="sb-foot-status">
            <span className={foot?.connected ? "sb-pulse" : "sb-pulse-off"} />
            {foot === null
              ? formatMessage({ id: "sidebar.connecting" })
              : formatMessage({ id: foot.connected ? "sidebar.serviceOk" : "sidebar.serviceDown" })}
          </div>
          <div className="sb-foot-meta">
            {foot?.connected
              ? formatMessage({ id: "sidebar.uptime" }, { dur: fmtDurLong(foot.uptime) })
              : "Node-Media-Server"}
          </div>
        </div>
      </aside>
    </div>
  );
}
