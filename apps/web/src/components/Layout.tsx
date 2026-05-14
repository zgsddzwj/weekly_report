import type { ReactElement } from "react";
import { Link, useLocation } from "react-router-dom";
import { getToken, setToken } from "../api";

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const loc = useLocation();
  const active = loc.pathname === to || (to !== "/" && loc.pathname.startsWith(to));
  return (
    <Link to={to} className={active ? "active" : ""}>
      {children}
    </Link>
  );
}

export default function Layout({ children }: { children: ReactElement }) {
  const loc = useLocation();
  if (loc.pathname === "/login") return children;

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">Week Report</div>
        <nav className="sidebar-nav">
          <NavLink to="/">📊 概览</NavLink>
          <NavLink to="/connections">🔗 Git 连接</NavLink>
          <NavLink to="/profiles">📁 周报档案</NavLink>
          <NavLink to="/reports">📋 报告历史</NavLink>
        </nav>
        <div className="sidebar-footer">
          <button
            className="secondary"
            style={{ width: "100%", justifyContent: "center" }}
            onClick={() => {
              setToken(null);
              window.location.href = "/login";
            }}
          >
            🚪 退出登录
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div style={{ fontSize: "0.9rem", color: "#64748b" }}>
            {getToken() ? "已登录" : "未登录"}
          </div>
          <div style={{ fontSize: "0.85rem", color: "#94a3b8" }}>
            {new Date().toLocaleDateString()}
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
