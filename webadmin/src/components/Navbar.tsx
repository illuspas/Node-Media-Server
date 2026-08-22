import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { toast } from "../lib/toast";

interface NavbarProps {
  title: string;
  onMenuClick: () => void;
}

const MENU_ITEMS: { msg: string; label: string; danger?: boolean }[] = [
  { msg: "个人资料（演示功能）", label: "个人资料" },
  { msg: "已切换到只读模式（演示）", label: "只读模式" },
  { msg: "已退出登录（演示）", label: "退出登录", danger: true }
];

export default function Navbar({ title, onMenuClick }: NavbarProps) {
  const [userOpen, setUserOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  return (
    <header className="nb-header">
      <div className="nb-left">
        <button className="nb-icon-btn" title="菜单" onClick={onMenuClick}>
          <Icon name="menu" />
        </button>
        <div className="nb-sep" />
        <span className="nb-title">{title}</span>
      </div>
      <div className="nb-right">
        <div className="nb-search">
          <Icon name="search" />
          <input
            type="text"
            placeholder="搜索流、任务、录像…"
            onKeyDown={e => {
              const value = (e.target as HTMLInputElement).value.trim();
              if (e.key === "Enter" && value) {
                toast(`正在搜索“${value}”（演示）`);
                (e.target as HTMLInputElement).value = "";
              }
            }}
          />
        </div>
        <button
          className="nb-icon-btn"
          title="通知"
          onClick={() => toast("您有 3 条未读告警", "warning")}
        >
          <Icon name="bell" />
          <span className="nb-noti-dot" />
        </button>
        <div className="nb-vsep" />
        <div
          ref={userRef}
          className={userOpen ? "nb-user open" : "nb-user"}
          onClick={e => {
            const item = (e.target as HTMLElement).closest(".nb-menu-item");
            if (item) {
              toast(item.getAttribute("data-msg") || "");
              setUserOpen(false);
              return;
            }
            setUserOpen(v => !v);
          }}
        >
          <div className="nb-avatar">管</div>
          <div className="nb-meta">
            <div className="name">管理员</div>
            <div className="sub">admin@nms.io</div>
          </div>
          <Icon name="chevron-down" />
          <div className="nb-menu">
            {MENU_ITEMS.map(item => (
              <div key={item.label}>
                {item.danger && <div className="nb-menu-sep" />}
                <button className={item.danger ? "nb-menu-item danger" : "nb-menu-item"} data-msg={item.msg}>
                  {item.label}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
