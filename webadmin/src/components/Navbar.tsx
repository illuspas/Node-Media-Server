import { useEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";
import Icon from "./Icon";
import { toast } from "../lib/toast";
import { LOCALES, localeStore } from "../i18n";

interface NavbarProps {
  title: string;
  username: string | null;
  onMenuClick: () => void;
  onLogout: () => void;
}

const MENU_ITEMS: { msgId: string; labelId: string }[] = [
  { msgId: "navbar.profileToast", labelId: "navbar.profile" },
  { msgId: "navbar.readonlyToast", labelId: "navbar.readonly" }
];

export default function Navbar({ title, username, onMenuClick, onLogout }: NavbarProps) {
  const { formatMessage, locale } = useIntl();
  const [userOpen, setUserOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (userRef.current && !userRef.current.contains(target)) setUserOpen(false);
      if (langRef.current && !langRef.current.contains(target)) setLangOpen(false);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  return (
    <header className="nb-header">
      <div className="nb-left">
        <button className="nb-icon-btn" title={formatMessage({ id: "navbar.menu" })} onClick={onMenuClick}>
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
            placeholder={formatMessage({ id: "navbar.searchPlaceholder" })}
            onKeyDown={e => {
              const value = (e.target as HTMLInputElement).value.trim();
              if (e.key === "Enter" && value) {
                toast(formatMessage({ id: "navbar.searchToast" }, { value }));
                (e.target as HTMLInputElement).value = "";
              }
            }}
          />
        </div>
        <button
          className="nb-icon-btn"
          title={formatMessage({ id: "navbar.notifications" })}
          onClick={() => toast(formatMessage({ id: "navbar.notificationToast" }), "warning")}
        >
          <Icon name="bell" />
          <span className="nb-noti-dot" />
        </button>
        <div ref={langRef} className={langOpen ? "nb-lang open" : "nb-lang"}>
          <button
            className="nb-icon-btn"
            title={formatMessage({ id: "navbar.language" })}
            aria-haspopup="menu"
            aria-expanded={langOpen}
            onClick={() => setLangOpen(v => !v)}
          >
            <Icon name="globe" />
          </button>
          <div className="nb-lang-menu">
            {LOCALES.map(l => (
              <button
                key={l.value}
                className={`nb-menu-item nb-lang-item ${l.value === locale ? "active" : ""}`}
                onClick={() => {
                  localeStore.set(l.value);
                  setLangOpen(false);
                }}
              >
                <span className="nb-lang-check">{l.value === locale && <Icon name="check" className="w-3.5 h-3.5" />}</span>
                {l.label}
              </button>
            ))}
          </div>
        </div>
        <div className="nb-vsep" />
        <div
          ref={userRef}
          className={userOpen ? "nb-user open" : "nb-user"}
          onClick={e => {
            const item = (e.target as HTMLElement).closest(".nb-menu-item");
            if (item) {
              const msg = item.getAttribute("data-msg");
              if (msg !== null) {
                toast(msg);
                setUserOpen(false);
              } else {
                setUserOpen(false);
                onLogout();
              }
              return;
            }
            setUserOpen(v => !v);
          }}
        >
          <div className="nb-avatar">
            {username ? username.charAt(0).toUpperCase() : formatMessage({ id: "navbar.avatarFallback" })}
          </div>
          <div className="nb-meta">
            <div className="name">{username || formatMessage({ id: "navbar.admin" })}</div>
            <div className="sub">{formatMessage({ id: "navbar.loggedIn" })}</div>
          </div>
          <Icon name="chevron-down" />
          <div className="nb-menu">
            {MENU_ITEMS.map(item => (
              <button
                key={item.labelId}
                className="nb-menu-item"
                data-msg={formatMessage({ id: item.msgId })}
              >
                {formatMessage({ id: item.labelId })}
              </button>
            ))}
            <div className="nb-menu-sep" />
            <button className="nb-menu-item danger">{formatMessage({ id: "navbar.logout" })}</button>
          </div>
        </div>
      </div>
    </header>
  );
}
