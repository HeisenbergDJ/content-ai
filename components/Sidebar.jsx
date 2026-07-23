"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  Database,
  Folder,
  LayoutGrid,
  LogOut,
  MessageSquare,
  Settings,
  Users,
} from "lucide-react";
import { useApp } from "@/lib/AppContext";
import { NAV_ITEMS, initials } from "@/lib/helpers";

const NAV_ICONS = {
  dashboard: LayoutGrid,
  creator:   MessageSquare,
  library:   Folder,
  skills:    Users,
  admin:     Settings,
};

function activeKey(pathname) {
  if (pathname.startsWith("/creator")) return "creator";
  if (pathname.startsWith("/library")) return "library";
  if (pathname.startsWith("/skills"))  return "skills";
  if (pathname.startsWith("/admin"))   return "admin";
  return "dashboard";
}

export default function Sidebar() {
  const { session, data, logout } = useApp();
  const router = useRouter();
  const pathname = usePathname();

  const users = data?.users || [];
  const currentUser = users.find((u) => u.id === session?.id) || session;
  const canAdmin = currentUser?.role === "tenant_admin" || currentUser?.role === "super_admin";
  const active = activeKey(pathname);

  function handleLogout() {
    logout();
    router.push("/");
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="login-logo" style={{ margin: 0 }}>
          <div className="logo-icon"><Database size={16} /></div>
          <div className="logo-text"><span>Content</span>AI</div>
        </div>
      </div>

      <div className="sidebar-nav">
        {["核心功能", "管理"].map((group) => {
          const items = NAV_ITEMS.filter((n) => n.group === group && (!n.adminOnly || canAdmin));
          if (!items.length) return null;
          return (
            <div className="nav-section" key={group}>
              <div className="nav-section-title">{group}</div>
              {items.map((n) => {
                const Icon = NAV_ICONS[n.key];
                return (
                  <button
                    key={n.key}
                    className={`nav-item ${active === n.key ? "active" : ""}`}
                    onClick={() => router.push(`/${n.key}`)}
                  >
                    <Icon /> {n.label}
                    {n.badge && <span className="badge">{n.badge}</span>}
                    {n.adminOnly && <span className="badge-admin">管理员</span>}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="sidebar-footer">
        <div className="user-card">
          <div className="avatar" style={{ background: "linear-gradient(135deg,#818CF8,#6366F1)" }}>
            {initials(currentUser?.name)}
          </div>
          <div className="user-info">
            <div className="user-name">{currentUser?.name}</div>
            <div className="user-role">{canAdmin ? "企业管理员" : "普通员工"}</div>
          </div>
          <button className="icon-btn" title="退出登录" onClick={handleLogout}>
            <LogOut />
          </button>
        </div>
      </div>
    </aside>
  );
}
