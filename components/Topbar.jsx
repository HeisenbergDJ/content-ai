"use client";

import { usePathname, useRouter } from "next/navigation";
import { Bell, Coins } from "lucide-react";
import { useApp } from "@/lib/AppContext";

const PAGE_TITLES = {
  "/dashboard": "工作台",
  "/creator":   "AI创作台",
  "/library":   "资料库",
  "/skills":    "Skill中心",
  "/admin":     "管理后台",
};

function getTitle(pathname) {
  for (const [prefix, title] of Object.entries(PAGE_TITLES)) {
    if (pathname.startsWith(prefix)) return title;
  }
  return "工作台";
}

export default function Topbar() {
  const { session, data } = useApp();
  const pathname = usePathname();
  const router = useRouter();

  const users = data?.users || [];
  const tenant = data?.tenant || {};
  const currentUser = users.find((u) => u.id === session?.id) || session;
  const canAdmin = currentUser?.role === "tenant_admin" || currentUser?.role === "super_admin";
  const isAdminPage = pathname.startsWith("/admin");
  const myRemaining = currentUser?.credits?.remaining ?? currentUser?.credits?.quota ?? 0;
  const displayCredits = isAdminPage && canAdmin ? (tenant.credits?.remaining ?? 0) : myRemaining;

  return (
    <div className="topbar">
      <div className="topbar-title">{getTitle(pathname)}</div>
      <div className="topbar-right">
        <div className="credits-badge">
          <Coins size={13} /> {displayCredits} credits
        </div>
        {canAdmin && (
          <div className="role-toggle">
            <button
              className={`role-toggle-btn ${isAdminPage ? "active" : ""}`}
              onClick={() => router.push("/admin")}
            >
              管理端
            </button>
            <button
              className={`role-toggle-btn ${!isAdminPage ? "active" : ""}`}
              onClick={() => router.push("/dashboard")}
            >
              员工端
            </button>
          </div>
        )}
        <button className="icon-btn" title="通知"><Bell /></button>
      </div>
    </div>
  );
}
