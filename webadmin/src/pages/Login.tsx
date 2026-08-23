import { useEffect, useState } from "react";
import { useIntl } from "react-intl";
import Icon from "../components/Icon";
import { login } from "../lib/api";

interface LoginProps {
  /** Called after the API accepts the challenge-response login. */
  onLoggedIn: (token: string, username: string) => void;
}

export default function Login({ onLoggedIn }: LoginProps) {
  const { formatMessage } = useIntl();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pageTitle = formatMessage({ id: "login.pageTitle" });
  useEffect(() => {
    document.title = `${pageTitle} · NMS Console`;
  }, [pageTitle]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError(formatMessage({ id: "login.errRequired" }));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { token, username: name } = await login(username.trim(), password);
      onLoggedIn(token, name);
    } catch (err) {
      setError(err instanceof Error ? err.message : formatMessage({ id: "login.errFailed" }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-[380px]">
        {/* brand */}
        <div className="flex flex-col items-center mb-6">
          <div className="sb-logo" style={{ width: 44, height: 44, borderRadius: 12 }}>
            <Icon name="radio" />
          </div>
          <h1 className="text-xl font-bold tracking-tight mt-3">NMS Console</h1>
          <p className="text-sm text-stone-500 mt-1">{formatMessage({ id: "login.subtitle" })}</p>
        </div>

        <form className="card p-6 space-y-4" onSubmit={onSubmit}>
          {error && (
            <div
              className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-700"
              role="alert"
            >
              <Icon name="alert-circle" className="w-4 h-4 mt-px shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="label" htmlFor="login-username">{formatMessage({ id: "login.username" })}</label>
            <div className="relative">
              <Icon name="user" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
              <input
                id="login-username"
                className="input"
                style={{ paddingLeft: "2.25rem" }}
                type="text"
                autoComplete="username"
                placeholder="admin"
                value={username}
                onChange={e => setUsername(e.target.value)}
                disabled={busy}
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="login-password">{formatMessage({ id: "login.password" })}</label>
            <div className="relative">
              <Icon name="lock" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
              <input
                id="login-password"
                className="input"
                style={{ paddingLeft: "2.25rem", paddingRight: "2.5rem" }}
                type={showPwd ? "text" : "password"}
                autoComplete="current-password"
                placeholder={formatMessage({ id: "login.passwordPlaceholder" })}
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={busy}
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-md text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"
                title={formatMessage({ id: showPwd ? "login.hidePassword" : "login.showPassword" })}
                onClick={() => setShowPwd(v => !v)}
                tabIndex={-1}
              >
                <Icon name={showPwd ? "eye-off" : "eye"} />
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn-primary w-full mt-1" disabled={busy}>
            {busy ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity=".25" />
                  <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
                {formatMessage({ id: "login.verifying" })}
              </>
            ) : (
              <>
                <Icon name="log-in" />
                {formatMessage({ id: "login.submit" })}
              </>
            )}
          </button>

          <p className="help flex items-center gap-1.5">
            <Icon name="shield" className="w-3.5 h-3.5 shrink-0" />
            {formatMessage({ id: "login.securityNote" })}
          </p>
        </form>

        <p className="text-center text-xs text-stone-400 mt-6">Node-Media-Server · REST API v1</p>
      </div>
    </div>
  );
}
