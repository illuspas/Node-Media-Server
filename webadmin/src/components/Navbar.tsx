import { useEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";
import Icon from "./Icon";
import { changePassword } from "../lib/api";
import { toast } from "../lib/toast";
import { LOCALES, localeStore } from "../i18n";

interface NavbarProps {
  title: string;
  username: string | null;
  onMenuClick: () => void;
  onLogout: () => void;
  /** Called after a successful password change: session ends, back to login. */
  onPasswordChanged: () => void;
}

export default function Navbar({ title, username, onMenuClick, onLogout, onPasswordChanged }: NavbarProps) {
  const { formatMessage, locale } = useIntl();
  const [userOpen, setUserOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);

  // password modal state
  const [pwdOpen, setPwdOpen] = useState(false);
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdBusy, setPwdBusy] = useState(false);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (userRef.current && !userRef.current.contains(target)) setUserOpen(false);
      if (langRef.current && !langRef.current.contains(target)) setLangOpen(false);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const openPwdModal = () => {
    setOldPwd("");
    setNewPwd("");
    setConfirmPwd("");
    setPwdError(null);
    setPwdOpen(true);
    setUserOpen(false);
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPwd || !newPwd || !confirmPwd) {
      setPwdError(formatMessage({ id: "navbar.pwdFillAll" }));
      return;
    }
    if (newPwd.length < 6) {
      setPwdError(formatMessage({ id: "navbar.pwdTooShort" }));
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdError(formatMessage({ id: "navbar.pwdMismatch" }));
      return;
    }
    if (newPwd === oldPwd) {
      setPwdError(formatMessage({ id: "navbar.pwdSame" }));
      return;
    }
    setPwdBusy(true);
    setPwdError(null);
    try {
      await changePassword(oldPwd, newPwd);
      setPwdOpen(false);
      toast(formatMessage({ id: "navbar.pwdToastChanged" }));
      onPasswordChanged();
    } catch (err) {
      // err.message is already localized by changePassword(); anything else is unexpected.
      setPwdError(err instanceof Error ? err.message : formatMessage({ id: "api.err.requestFailed" }, { status: 0 }));
    } finally {
      setPwdBusy(false);
    }
  };

  return (
    <>
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
                setUserOpen(false);
                const action = item.getAttribute("data-action");
                if (action === "password") openPwdModal();
                else if (action === "logout") onLogout();
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
              <button className="nb-menu-item" data-action="password">
                {formatMessage({ id: "navbar.changePassword" })}
              </button>
              <div className="nb-menu-sep" />
              <button className="nb-menu-item danger" data-action="logout">
                {formatMessage({ id: "navbar.logout" })}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* change password modal */}
      <div
        className={pwdOpen ? "modal-overlay open" : "modal-overlay"}
        onClick={e => e.target === e.currentTarget && setPwdOpen(false)}
      >
        <div className="modal-card" style={{ maxWidth: 400 }}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
            <div>
              <h3 className="font-semibold">{formatMessage({ id: "navbar.changePassword" })}</h3>
              <p className="text-xs text-stone-500 mt-0.5">{formatMessage({ id: "navbar.pwdSubtitle" })}</p>
            </div>
            <button className="btn btn-ghost btn-icon" title={formatMessage({ id: "navbar.pwdClose" })} onClick={() => setPwdOpen(false)}>
              <Icon name="x" className="w-4 h-4" />
            </button>
          </div>
          <form className="p-5 space-y-4" onSubmit={submitPassword}>
            {pwdError && (
              <div
                className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-700"
                role="alert"
              >
                <Icon name="alert-circle" className="w-4 h-4 mt-px shrink-0" />
                <span>{pwdError}</span>
              </div>
            )}
            <div>
              <label className="label" htmlFor="pwd-old">{formatMessage({ id: "navbar.pwdOld" })}</label>
              <input
                id="pwd-old"
                className="input"
                type="password"
                autoComplete="current-password"
                value={oldPwd}
                onChange={e => setOldPwd(e.target.value)}
                disabled={pwdBusy}
                autoFocus
              />
            </div>
            <div>
              <label className="label" htmlFor="pwd-new">{formatMessage({ id: "navbar.pwdNew" })}</label>
              <input
                id="pwd-new"
                className="input"
                type="password"
                autoComplete="new-password"
                placeholder={formatMessage({ id: "navbar.pwdPlaceholderMin" })}
                value={newPwd}
                onChange={e => setNewPwd(e.target.value)}
                disabled={pwdBusy}
              />
            </div>
            <div>
              <label className="label" htmlFor="pwd-confirm">{formatMessage({ id: "navbar.pwdConfirm" })}</label>
              <input
                id="pwd-confirm"
                className="input"
                type="password"
                autoComplete="new-password"
                value={confirmPwd}
                onChange={e => setConfirmPwd(e.target.value)}
                disabled={pwdBusy}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
              <button type="button" className="btn btn-ghost" onClick={() => setPwdOpen(false)} disabled={pwdBusy}>
                {formatMessage({ id: "navbar.pwdCancel" })}
              </button>
              <button type="submit" className="btn btn-primary" disabled={pwdBusy}>
                {pwdBusy && <Icon name="refresh-cw" className="w-3.5 h-3.5 animate-spin" />}
                {formatMessage({ id: "navbar.pwdSubmit" })}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
