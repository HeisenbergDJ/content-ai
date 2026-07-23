"use client";

import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { useApp } from "@/lib/AppContext";
import { fmtDate, statusClass, STATUS_LABEL } from "@/lib/helpers";

export default function DashboardPage() {
  const { session, data } = useApp();
  const router = useRouter();

  const users      = data?.users      || [];
  const tasks      = data?.tasks      || [];
  const library    = data?.library    || [];
  const skills     = data?.skills     || [];
  const activities = data?.activities || [];

  const currentUser = users.find((u) => u.id === session?.id) || session;
  const canAdmin    = currentUser?.role === "tenant_admin" || currentUser?.role === "super_admin";
  const visibleTasks   = canAdmin ? tasks : tasks.filter((t) => t.userId === currentUser?.id || t.userName === currentUser?.name);
  const myRemaining    = currentUser?.credits?.remaining ?? currentUser?.credits?.quota ?? 0;
  const myUsed         = currentUser?.credits?.used ?? 0;
  const inProgressTasks = visibleTasks.filter((t) => t.status === "in_progress");

  return (
    <section className="page">
      <div className="content">
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">我的 Credits</div>
            <div className="stat-value">{myRemaining}</div>
            <div className="stat-change">已用 {myUsed}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">我的创作数</div>
            <div className="stat-value">{visibleTasks.length}</div>
            <div className="stat-change stat-up">进行中 {inProgressTasks.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">资料库</div>
            <div className="stat-value">{library.length}</div>
            <div className="stat-change stat-up">企业共享资产</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">可用 Skill</div>
            <div className="stat-value">{skills.length}</div>
            <div className="stat-change">可在创作中调用</div>
          </div>
        </div>

        <div className="content-grid">
          <div>
            <div className="section-header">
              <div className="section-title">我的最近创作</div>
              <button className="section-action" onClick={() => router.push("/creator")}>查看全部任务</button>
            </div>
            <div className="card">
              {visibleTasks.slice(0, 6).map((t, i) => (
                <button
                  className="list-item"
                  key={t.id}
                  onClick={() => router.push(`/creator/${t.id}`)}
                >
                  <div className="list-icon" style={{ background: i % 2 ? "#FCE7F3" : "#EEF2FF" }}>
                    <FileText size={16} color={i % 2 ? "#DB2777" : "#4F46E5"} />
                  </div>
                  <div className="list-info">
                    <div className="list-name">{t.title}</div>
                    <div className="list-meta">
                      <span>{t.type}</span>
                      <span>{fmtDate(t.updatedAt)}</span>
                      <span>已消耗 {t.credits?.consumed || 0} credits</span>
                    </div>
                  </div>
                  <span className={`tag ${statusClass(t.status)}`}>{STATUS_LABEL[t.status] || t.status}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="section-header"><div className="section-title">团队动态</div></div>
            <div className="card">
              <div className="activity-list">
                {activities.slice(0, 8).map((a, i) => (
                  <div className="activity-item" key={a.id}>
                    <span
                      className="activity-dot"
                      style={{ background: ["var(--success)", "var(--info)", "var(--primary)", "var(--warning)"][i % 4] }}
                    />
                    <div>
                      <div className="activity-text">
                        <strong>{a.actor?.name || "系统"}</strong> {a.displayText}
                      </div>
                      <div className="activity-time">{fmtDate(a.createdAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
