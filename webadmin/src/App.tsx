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

function Shell() {
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
          onMenuClick={() => setOpenLocationKey(sidebarOpen ? null : location.key)}
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
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  );
}
