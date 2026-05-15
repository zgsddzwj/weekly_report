import type { ReactElement } from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Link2, FolderOpen, ClipboardList, LogOut } from "lucide-react";
import { setToken } from "../api";

function NavItem({ to, icon: Icon, children }: { to: string; icon: React.ElementType; children: React.ReactNode }) {
  const loc = useLocation();
  const active = loc.pathname === to || (to !== "/" && loc.pathname.startsWith(to));
  return (
    <Link to={to} className={active ? "active" : ""}>
      <Icon size={18} strokeWidth={2} />
      {children}
    </Link>
  );
}

export default function Layout({ children }: { children: ReactElement }) {
  const loc = useLocation();
  if (loc.pathname === "/login") return children;

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">
            <ClipboardList size={16} />
          </div>
          Week Report
        </div>
        <nav className="sidebar-nav">
          <NavItem to="/" icon={LayoutDashboard}>概览</NavItem>
          <NavItem to="/connections" icon={Link2}>Git 连接</NavItem>
          <NavItem to="/profiles" icon={FolderOpen}>周报档案</NavItem>
          <NavItem to="/reports" icon={ClipboardList}>报告历史</NavItem>
        </nav>
        <div className="sidebar-footer">
          <button
            className="btn btn-ghost"
            style={{ width: "100%", justifyContent: "flex-start" }}
            onClick={() => {
              setToken(null);
              window.location.href = "/login";
            }}
          >
            <LogOut size={16} />
            退出登录
          </button>
        </div>
      </aside>
      <div className="main">
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
