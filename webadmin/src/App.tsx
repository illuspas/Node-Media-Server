import { useEffect, useState } from "react";
import { HashRouter, Route, Routes, useLocation } from "react-router-dom";
import { useIntl } from "react-intl";
import Sidebar from "./components/Sidebar";
import Navbar from "./components/Navbar";
import ToastHost from "./components/ToastHost";
import Dashboard from "./pages/Dashboard";
import Streams from "./pages/Streams";
import Relay from "./pages/Relay";
import Records from "./pages/Records";
import History from "./pages/History";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import { getToken, getUsername, saveSession, clearSession, UNAUTHORIZED_EVENT } from "./lib/api";
import { toast } from "./lib/toast";
import { t } from "./i18n";

const HOME = { path: "/", titleId: "nav.dashboard" } as const;

function titleIdFor(pathname: string): string {
  switch (pathname) {
    case "/streams":
      return "nav.streams";
    case "/relay":
      return "nav.relay";
    case "/records":
      return "nav.records";
    case "/history":
      return "nav.history";
    case "/settings":
      return "nav.settings";
    default:
      return HOME.titleId;
  }
}

interface ShellProps {
  username: string | null;
  onLogout: () => void;
}

function Shell({ username, onLogout }: ShellProps) {
  const location = useLocation();
  const { formatMessage } = useIntl();
  // Sidebar stays open only while the route it was opened on is still current.
  const [openLocationKey, setOpenLocationKey] = useState<string | null>(null);
  const sidebarOpen = openLocationKey === location.key;
  const title = formatMessage({ id: titleIdFor(location.pathname) });

  useEffect(() => {
    document.title = `${title} · NMS Console`;
    window.scrollTo(0, 0);
  }, [location, title]);

  return (
    <>
      <Sidebar open={sidebarOpen} onClose={() => setOpenLocationKey(null)} />
      <div className="lg:pl-60 min-h-screen">
        <Navbar
          title={title}
          username={username}
          onMenuClick={() => setOpenLocationKey(sidebarOpen ? null : location.key)}
          onLogout={onLogout}
        />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/streams" element={<Streams />} />
          <Route path="/relay" element={<Relay />} />
          <Route path="/records" element={<Records />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
      <ToastHost />
    </>
  );
}

export default function App() {
  const [auth, setAuth] = useState(() => ({ token: getToken(), username: getUsername() }));

  // API calls that come back 401 clear the session and bounce to the login page.
  useEffect(() => {
    const onUnauthorized = () => {
      setAuth({ token: null, username: null });
      // t() reads the live locale, unlike a useIntl snapshot captured at mount.
      toast(t("app.toast.sessionExpired"), "warning");
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  if (!auth.token) {
    return (
      <>
        <Login
          onLoggedIn={(token, username) => {
            saveSession(token, username);
            setAuth({ token, username });
          }}
        />
        <ToastHost />
      </>
    );
  }

  return (
    <HashRouter>
      <Shell
        username={auth.username}
        onLogout={() => {
          clearSession();
          setAuth({ token: null, username: null });
          toast(t("app.toast.loggedOut"));
        }}
      />
    </HashRouter>
  );
}
