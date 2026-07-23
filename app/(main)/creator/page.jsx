"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Grid3X3,
  Image,
  List,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Presentation,
  Search,
  Users,
  User,
  Video,
  Zap,
} from "lucide-react";
import { useApp } from "@/lib/AppContext";
import {
  CREATOR_TABS,
  STATUS_LABEL,
  fmtDate,
  projectGradient,
  statusClass,
  stepIndex,
} from "@/lib/helpers";

const CREATOR_TAB_ICONS = {
  wechat:       MessageSquare,
  interactive:  Zap,
  poster:       Image,
  ppt:          Presentation,
  video:        Video,
};

// ─── Three-dot context menu（portal，解决 overflow 裁切）────────────────────────
function TaskMenu({ onOpen, onRename, onArchive, onDelete, canAdmin, isArchived }) {
  const [open, setOpen] = useState(false);
  const [pos,  setPos]  = useState({ top: 0, right: 0 });
  const btnRef          = useRef(null);
  const menuRef         = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (menuRef.current  && !menuRef.current.contains(e.target) &&
          btnRef.current   && !btnRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function toggle(e) {
    e.stopPropagation();
    if (!open) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setOpen((v) => !v);
  }

  function act(fn) { setOpen(false); fn(); }

  const canEdit = !isArchived || canAdmin;

  const dropdown = open ? createPortal(
    <div ref={menuRef} className="task-menu-dropdown"
      style={{ position: "fixed", top: pos.top, right: pos.right, zIndex: 9999 }}>
      <button className="task-menu-item" onClick={() => act(onOpen)}>打开</button>
      {canEdit && <button className="task-menu-item" onClick={() => act(onRename)}>重命名</button>}
      {!isArchived && <button className="task-menu-item" onClick={() => act(onArchive)}>归档到资料库</button>}
      {canEdit && (
        <>
          <div className="task-menu-divider" />
          <button className="task-menu-item danger" onClick={() => act(onDelete)}>删除</button>
        </>
      )}
    </div>,
    document.body
  ) : null;

  return (
    <div className="task-menu-wrap">
      <button ref={btnRef} className="task-menu-btn" onClick={toggle} aria-label="更多操作">
        <MoreHorizontal size={16} />
      </button>
      {dropdown}
    </div>
  );
}

// ─── Creator page ─────────────────────────────────────────────────────────────
export default function CreatorPage() {
  const { session, data, loadBootstrap, updateTask, addTask } = useApp();
  const router = useRouter();
  const [creatorMode, setCreatorMode] = useState("wechat");
  const [viewMode,    setViewMode]    = useState("grid");
  const [perspective, setPerspective] = useState("personal"); // "personal" | "team"
  const [renamingId,  setRenamingId]  = useState(null);
  const [renameVal,   setRenameVal]   = useState("");
  const renameInputRef = useRef(null);

  const users       = data?.users || [];
  const tasks       = data?.tasks || [];
  const currentUser = users.find((u) => u.id === session?.id) || session;
  const canAdmin    = currentUser?.role === "tenant_admin" || currentUser?.role === "super_admin";

  // 个人视角：当前用户的非归档项目；团队视角：所有已归档项目
  const ownTasks      = tasks.filter((t) => t.userId === currentUser?.id || t.userName === currentUser?.name);
  const personalTasks = ownTasks.filter((t) => t.status !== "archived");
  const teamTasks     = canAdmin
    ? tasks.filter((t) => t.status === "archived")
    : ownTasks.filter((t) => t.status === "archived");
  const allVisible    = perspective === "team" ? teamTasks : personalTasks;
  // 按当前 tab 类型过滤任务
  const visibleTasks  = creatorMode === "interactive"
    ? allVisible.filter((t) => t.taskType === "interactive")
    : allVisible.filter((t) => !t.taskType || t.taskType === "wechat");

  async function handleNewInteractive() {
    const res = await fetch("/api/creation-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId:       session?.id,
        userName:     session?.name,
        enterpriseId: session?.enterpriseId,
        taskType:     "interactive",
      }),
    });
    const json = await res.json();
    if (json.ok) {
      addTask(json.task);
      router.push(`/creator/${json.task.id}`);
    }
  }

  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus();
  }, [renamingId]);

  function startRename(t) { setRenamingId(t.id); setRenameVal(t.title || ""); }

  async function commitRename(id) {
    const title = renameVal.trim();
    setRenamingId(null);
    if (!title) return;
    const res  = await fetch(`/api/creation-tasks/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    const json = await res.json();
    if (json.ok && json.task) updateTask(json.task);
  }

  async function handleDelete(id) {
    if (!confirm("确定要删除该项目吗？此操作不可撤销。")) return;
    await fetch(`/api/creation-tasks/${id}`, { method: "DELETE" });
    loadBootstrap();
  }

  // 归档 = 从步骤四消息中提取最终排版 HTML，上传到资料库
  async function handleArchive(task) {
    const layoutMsgs = task.steps?.layout?.messages || [];
    let selectedSection = null;
    for (let i = layoutMsgs.length - 1; i >= 0; i--) {
      const m = layoutMsgs[i];
      if (m.type === "layout" && m.candidates?.length > 0) {
        const sel = m.candidates.find((c) => c.candidateId === m.selectedId) ?? m.candidates[0];
        selectedSection = sel?.section;
        break;
      }
    }
    if (!selectedSection) {
      alert("未找到排版内容，请先在第四步完成排版输出后再归档。");
      return;
    }
    if (!confirm(`确认将「${task.title}」的排版方案归档到资料库？`)) return;

    const res  = await fetch("/api/library-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name:         task.title,
        category:     "wechat",
        htmlContent:  selectedSection,
        enterpriseId: session?.enterpriseId,
        userId:       session?.id,
        userName:     session?.name,
        sourceTaskId: task.id,
      }),
    });
    const json = await res.json();
    if (json.ok) {
      await fetch(`/api/creation-tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
      alert("已成功归档到资料库 → 公众号图文");
      loadBootstrap();
    } else {
      alert("归档失败：" + (json.message || "未知错误"));
    }
  }

  function handleOpenTask(t) {
    router.push(`/creator/${t.id}`);
  }

  return (
    <section className="page">
      <div className="creator-shell">
        <div className="creator-tab-bar">
          {CREATOR_TABS.map((m) => {
            const Icon = CREATOR_TAB_ICONS[m.key];
            return (
              <button
                key={m.key}
                className={`creator-tab ${creatorMode === m.key ? "active" : ""}`}
                onClick={() => setCreatorMode(m.key)}
              >
                <Icon size={15} /> {m.label}
                {m.soon && <span className="soon-tag">敬请期待</span>}
              </button>
            );
          })}
        </div>

        {creatorMode !== "wechat" && creatorMode !== "interactive" ? (
          <div className="content">
            <div className="empty-state">
              {CREATOR_TABS.find((m) => m.key === creatorMode)?.label} 流程开发中...敬请期待。
            </div>
          </div>
        ) : (
          <div className="content">
            <div className="task-toolbar">
              <div className="task-toolbar-right" style={{ marginLeft: 0, flex: 1 }}>
                {/* 个人 / 团队视角切换 */}
                <div className="perspective-toggle">
                  <button
                    className={`perspective-btn ${perspective === "personal" ? "active" : ""}`}
                    onClick={() => setPerspective("personal")}
                  >
                    <User size={13} /> 个人
                  </button>
                  <button
                    className={`perspective-btn ${perspective === "team" ? "active" : ""}`}
                    onClick={() => setPerspective("team")}
                  >
                    <Users size={13} /> 团队
                  </button>
                </div>
                <div className="search-wrapper">
                  <Search size={14} />
                  <input className="search-input" placeholder="搜索任务..." />
                </div>
                <div className="view-toggle">
                  <button
                    className={`view-toggle-btn ${viewMode === "grid" ? "active" : ""}`}
                    onClick={() => setViewMode("grid")} title="卡片视图"
                  >
                    <Grid3X3 size={15} />
                  </button>
                  <button
                    className={`view-toggle-btn ${viewMode === "list" ? "active" : ""}`}
                    onClick={() => setViewMode("list")} title="列表视图"
                  >
                    <List size={15} />
                  </button>
                </div>
                {perspective === "personal" && (
                  <button
                    className="btn btn-primary"
                    onClick={() => creatorMode === "interactive" ? handleNewInteractive() : router.push("/creator/new")}
                  >
                    <Plus size={13} /> 新建项目
                  </button>
                )}
              </div>
            </div>

            {/* ── Grid view ── */}
            {viewMode === "grid" && (
              <div className="project-grid">
                <button
                  className="project-card new-card"
                  onClick={() => creatorMode === "interactive" ? handleNewInteractive() : router.push("/creator/new")}
                >
                  <div className="new-card-inner">
                    <div className="new-card-icon"><Plus size={22} /></div>
                    <div>新建项目</div>
                  </div>
                </button>
                {visibleTasks.map((t, i) => (
                  <div className="project-card-wrap" key={t.id}>
                    <button className="project-card" onClick={() => handleOpenTask(t)}>
                      <div className="project-card-thumb" style={{ background: projectGradient(i) }}>
                        <div style={{ color: "#fff", fontSize: 15, fontWeight: 650, textShadow: "0 1px 4px rgba(0,0,0,.28)" }}>
                          {t.title}
                        </div>
                      </div>
                      <div className="project-card-info">
                        {renamingId === t.id ? (
                          <input
                            ref={renameInputRef}
                            className="project-rename-input"
                            value={renameVal}
                            onChange={(e) => setRenameVal(e.target.value)}
                            onBlur={() => commitRename(t.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitRename(t.id);
                              if (e.key === "Escape") setRenamingId(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <div className="project-card-title">{t.title}</div>
                        )}
                        <div className="project-card-status-row">
                          <span className={`project-card-status ${statusClass(t.status)}`}>
                            {STATUS_LABEL[t.status] || t.status}
                          </span>
                          <span className="project-card-step">
                            {t.taskType === "interactive"
                              ? `已生成 ${(t.generations || []).length} 次`
                              : `步骤 ${stepIndex(t.currentStep) + 1}/4`}
                          </span>
                        </div>
                        <div className="project-card-meta">
                          <span>{fmtDate(t.updatedAt)}</span>
                        </div>
                      </div>
                    </button>
                    <TaskMenu
                      onOpen={() => handleOpenTask(t)}
                      onRename={() => startRename(t)}
                      onArchive={() => handleArchive(t)}
                      onDelete={() => handleDelete(t.id)}
                      canAdmin={canAdmin}
                      isArchived={t.status === "archived"}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* ── List view ── */}
            {viewMode === "list" && (
              <div className="project-list">
                <div className="project-list-header">
                  <span className="pl-col pl-col-thumb">预览</span>
                  <span className="pl-col pl-col-name">名称</span>
                  <span className="pl-col pl-col-type">类型</span>
                  <span className="pl-col pl-col-step">进度</span>
                  <span className="pl-col pl-col-date">创建时间</span>
                  <span className="pl-col pl-col-updated">最近更新</span>
                  <span className="pl-col pl-col-actions" />
                </div>
                {visibleTasks.map((t, i) => (
                  <div
                    className="project-list-row"
                    key={t.id}
                    onClick={() => renamingId !== t.id && handleOpenTask(t)}
                  >
                    <span className="pl-col pl-col-thumb">
                      <div className="pl-thumb" style={{ background: projectGradient(i) }} />
                    </span>
                    <span className="pl-col pl-col-name">
                      {renamingId === t.id ? (
                        <input
                          ref={renameInputRef}
                          className="project-rename-input"
                          value={renameVal}
                          onChange={(e) => setRenameVal(e.target.value)}
                          onBlur={() => commitRename(t.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename(t.id);
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className="pl-name">{t.title}</span>
                      )}
                    </span>
                    <span className="pl-col pl-col-type">
                      <span className="pl-badge">
                        {t.taskType === "interactive" ? "交互式图文" : "公众号图文"}
                      </span>
                    </span>
                    <span className="pl-col pl-col-step">
                      <span className={`pl-status ${statusClass(t.status)}`}>
                        {STATUS_LABEL[t.status] || t.status}
                      </span>
                    </span>
                    <span className="pl-col pl-col-date">{fmtDate(t.createdAt)}</span>
                    <span className="pl-col pl-col-updated">{fmtDate(t.updatedAt)}</span>
                    <span className="pl-col pl-col-actions" onClick={(e) => e.stopPropagation()}>
                      <TaskMenu
                        onOpen={() => handleOpenTask(t)}
                        onRename={() => startRename(t)}
                        onArchive={() => handleArchive(t)}
                        onDelete={() => handleDelete(t.id)}
                        canAdmin={canAdmin}
                      />
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
