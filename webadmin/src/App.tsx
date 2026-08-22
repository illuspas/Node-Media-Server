import { useEffect, useState } from "react";
import { HashRouter, Route, Routes, useLocation } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Navbar from "./components/Navbar";
import ToastHost from "./components/ToastHost";
import Dashboard from "./pages/Dashboard";
import Streams from "./pages/Streams";
import Relay from "./pages/Relay";
import Records from "./pages/Records";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import { getToken, getUsername, saveSession, clearSession, UNAUTHORIZED_EVENT } from "./lib/api";
import { toast } from "./lib/toast";

const HOME = { path: "/", title: "仪表盘" } as const;

function titleFor(pathname: string): string {
  switch (pathname) {
    case "/streams":
      return "流列表";
    case "/relay":
      return "流转发";
    case "/records":
      return "流录像";
    case "/settings":
      return "系统设置";
    default:
      return HOME.title;
  }
}

interface ShellProps {
  username: string | null;
  onLogout: () => void;
}

function Shell({ username, onLogout }: ShellProps) {
  const location = useLocation();
  // Sidebar stays open only while the route it was opened on is still current.
  const [openLocationKey, setOpenLocationKey] = useState<string | null>(null);
  const sidebarOpen = openLocationKey === location.key;
  const title = titleFor(location.pathname);

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
      toast("登录已过期，请重新登录", "warning");
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
          toast("已退出登录");
        }}
      />
    </HashRouter>
  );
}
