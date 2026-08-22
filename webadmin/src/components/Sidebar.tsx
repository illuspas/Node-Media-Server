import { NavLink } from "react-router-dom";
import Icon from "./Icon";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

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
            <span className="sb-pulse" />
            所有服务运行正常
          </div>
          <div className="sb-foot-meta">v2.6.2 · 已稳定运行 14 天</div>
        </div>
      </aside>
    </div>
  );
}
