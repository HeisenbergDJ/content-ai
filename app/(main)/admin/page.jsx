"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Eye, EyeOff, Key, XCircle } from "lucide-react";
import { useApp } from "@/lib/AppContext";
import { ADMIN_TABS, STATUS_LABEL, fmtDate } from "@/lib/helpers";

// 支持的服务商和模型
const PROVIDERS = [
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "openai",    label: "OpenAI (GPT)" },
  { value: "deepseek",  label: "DeepSeek" },
];
const MODELS = {
  anthropic: [
    { value: "claude-sonnet-4-6",         label: "Claude Sonnet 4.6（推荐）" },
    { value: "claude-opus-4-8",           label: "Claude Opus 4.8" },
    { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  ],
  openai: [
    { value: "gpt-4o",      label: "GPT-4o" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  ],
  deepseek: [
    { value: "deepseek-chat",     label: "DeepSeek Chat" },
    { value: "deepseek-reasoner", label: "DeepSeek Reasoner" },
  ],
};

export default function AdminPage() {
  const { session, data, loadBootstrap } = useApp();
  const [adminTab,    setAdminTab]    = useState("credits");
  const [quotaDrafts, setQuotaDrafts] = useState({});

  // ── 模型配置表单状态 ──
  const [apiCfg,     setApiCfg]     = useState(null);
  const [provDraft,  setProvDraft]  = useState("anthropic");
  const [modelDraft, setModelDraft] = useState("claude-sonnet-4-6");
  const [keyDraft,   setKeyDraft]   = useState("");
  const [showKey,    setShowKey]    = useState(false);
  const [cfgSaving,  setCfgSaving]  = useState(false);
  const [cfgMsg,     setCfgMsg]     = useState(null); // { ok, text }

  // 切到「模型配置」tab 时加载当前配置
  useEffect(() => {
    if (adminTab !== "api-config") return;
    fetch("/api/admin/api-config")
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) return;
        setApiCfg(j.apiConfig);
        if (j.apiConfig.provider) setProvDraft(j.apiConfig.provider);
        if (j.apiConfig.model)    setModelDraft(j.apiConfig.model);
      })
      .catch(() => {});
  }, [adminTab]);

  const users   = data?.users   || [];
  const tasks   = data?.tasks   || [];
  const library = data?.library || [];
  const tenant  = data?.tenant  || {};

  const currentUser = users.find((u) => u.id === session?.id) || session;
  const canAdmin    = currentUser?.role === "tenant_admin" || currentUser?.role === "super_admin";

  if (!canAdmin) {
    return (
      <section className="page">
        <div className="content">
          <div className="empty-state">无权限访问管理后台。</div>
        </div>
      </section>
    );
  }

  // Merge user edits over live DB values
  function quotaFor(u) {
    return quotaDrafts[u.id] ?? u.credits?.quota ?? 0;
  }

  async function updateQuota(userId) {
    const quota = Number(quotaFor(users.find((u) => u.id === userId)));
    const res   = await fetch("/api/admin/credits/quota", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, quota }),
    });
    const json  = await res.json();
    if (!json.ok) { alert(json.message || "保存失败"); return; }
    setQuotaDrafts((v) => { const n = { ...v }; delete n[userId]; return n; });
    await loadBootstrap();
  }

  async function toggleUser(userId) {
    const res  = await fetch("/api/admin/employees/toggle", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const json = await res.json();
    if (!json.ok) { alert(json.message || "操作失败"); return; }
    await loadBootstrap();
  }

  // 审核产出库条目：approve | reject
  async function reviewItem(itemId, action) {
    const res  = await fetch(`/api/library-items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewStatus: action === "approve" ? "approved" : "rejected" }),
    });
    const json = await res.json();
    if (!json.ok) { alert(json.message || "操作失败"); return; }
    await loadBootstrap();
  }

  // 保存 API 配置
  async function saveApiConfig() {
    setCfgSaving(true);
    setCfgMsg(null);
    try {
      const body = { provider: provDraft, model: modelDraft };
      if (keyDraft) body.apiKey = keyDraft;          // 有填才更新 Key
      const res  = await fetch("/api/admin/api-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.ok) {
        setApiCfg(json.apiConfig);
        setKeyDraft("");
        setShowKey(false);
        setCfgMsg({ ok: true, text: "配置已保存" });
      } else {
        setCfgMsg({ ok: false, text: json.message || "保存失败" });
      }
    } catch (e) {
      setCfgMsg({ ok: false, text: e.message || "网络错误" });
    }
    setCfgSaving(false);
  }

  // 删除 API Key
  async function deleteApiKey() {
    if (!confirm("确定要删除 API Key 吗？删除后 AI 功能将无法正常使用。")) return;
    const res  = await fetch("/api/admin/api-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: "" }),
    });
    const json = await res.json();
    if (json.ok) {
      setApiCfg(json.apiConfig);
      setCfgMsg({ ok: true, text: "API Key 已删除" });
    }
  }

  const pendingCount = library.filter((f) => f.review?.status === "pending").length;

  return (
    <section className="page">
      <div className="content">
        <div className="tabs">
          {ADMIN_TABS.map((t) => (
            <button
              key={t.key}
              className={`tab ${adminTab === t.key ? "active" : ""}`}
              onClick={() => setAdminTab(t.key)}
            >
              {t.label}
              {t.key === "review" && pendingCount > 0 && (
                <span className="review-badge-pill">{pendingCount}</span>
              )}
            </button>
          ))}
        </div>

        {adminTab === "credits" && (
          <>
            <div className="credit-overview">
              <div className="credit-overview-card highlight">
                <div className="label">企业 Credits 总池</div>
                <div className="value">{tenant.credits?.totalQuota || 0}</div>
                <div className="sub">当前周期 {tenant.credits?.period}</div>
              </div>
              <div className="credit-overview-card">
                <div className="label">已分配</div>
                <div className="value">{tenant.credits?.employeeAllocated || 0}</div>
                <div className="sub">员工 quota 合计</div>
              </div>
              <div className="credit-overview-card">
                <div className="label">已消耗</div>
                <div className="value">{tenant.credits?.consumed || 0}</div>
                <div className="sub">系统累计 used</div>
              </div>
              <div className="credit-overview-card">
                <div className="label">剩余</div>
                <div className="value">{tenant.credits?.remaining || 0}</div>
                <div className="sub">可用企业余额</div>
              </div>
            </div>
            <table className="data-table">
              <thead>
                <tr><th>员工</th><th>状态</th><th>quota</th><th>used</th><th>remaining</th><th>调整配额</th></tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.status}</td>
                    <td>{u.credits?.quota || 0}</td>
                    <td>{u.credits?.used || 0}</td>
                    <td>{u.credits?.remaining || 0}</td>
                    <td>
                      <input
                        className="allocate-input"
                        value={quotaFor(u)}
                        onChange={(e) => setQuotaDrafts((v) => ({ ...v, [u.id]: e.target.value }))}
                      />
                      {" "}
                      <button className="btn btn-sm" onClick={() => updateQuota(u.id)}>保存</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {adminTab === "employees" && (
          <table className="data-table">
            <thead>
              <tr><th>员工</th><th>部门 / 小组</th><th>坐席状态</th><th>Credits</th><th>操作</th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.name}</strong>
                    <div className="list-meta">{u.email}</div>
                  </td>
                  <td>{u.department?.departmentName || "-"} / {u.department?.groupName || "-"}</td>
                  <td>
                    <span className={`seat-badge ${u.status === "active" ? "seat-active" : "seat-disabled"}`}>
                      {u.status === "active" ? "占用" : "已释放"}
                    </span>
                  </td>
                  <td>{u.credits?.used || 0}/{u.credits?.quota || 0}</td>
                  <td>
                    <button
                      className={`btn btn-sm ${u.status === "active" ? "btn-danger" : ""}`}
                      onClick={() => toggleUser(u.id)}
                    >
                      {u.status === "active" ? "停用" : "启用"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {adminTab === "outputs" && (
          <table className="data-table">
            <thead>
              <tr><th>产物名称</th><th>类型</th><th>创建者</th><th>状态</th><th>Credits</th></tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td>{t.title}</td>
                  <td>{t.type}</td>
                  <td>{t.userName || "-"}</td>
                  <td>{STATUS_LABEL[t.status] || t.status}</td>
                  <td>{t.credits?.consumed || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {adminTab === "review" && (
          <>
            <div style={{ marginBottom: 12, fontSize: 13, color: "var(--text-secondary)" }}>
              共 <strong>{library.length}</strong> 条归档记录，其中
              <span style={{ color: pendingCount > 0 ? "var(--warning, #D97706)" : "var(--success)", fontWeight: 600, margin: "0 4px" }}>
                {pendingCount}
              </span>
              条待审核
            </div>
            <table className="data-table">
              <thead>
                <tr><th>资料名称</th><th>归档者</th><th>提交时间</th><th>审核状态</th><th>操作</th></tr>
              </thead>
              <tbody>
                {library.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", color: "var(--text-hint)", padding: "32px 0" }}>
                      暂无归档记录
                    </td>
                  </tr>
                ) : library.map((f) => (
                  <tr key={f.id} className={f.review?.status === "pending" ? "review-row-pending" : ""}>
                    <td><strong>{f.name}</strong></td>
                    <td>{f.uploader?.name || "-"}</td>
                    <td>{fmtDate(f.createdAt)}</td>
                    <td>
                      <span className={`review-status-badge review-${f.review?.status || "pending"}`}>
                        {{ approved: "已通过", pending: "待审核", rejected: "已拒绝" }[f.review?.status] || "待审核"}
                      </span>
                    </td>
                    <td>
                      {f.review?.status === "pending" ? (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            className="btn btn-sm btn-success"
                            onClick={() => reviewItem(f.id, "approve")}
                          >
                            <CheckCircle2 size={12} /> 通过
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => reviewItem(f.id, "reject")}
                          >
                            <XCircle size={12} /> 拒绝
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: "var(--text-hint)" }}>已处理</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {adminTab === "perms" && (
          <table className="data-table">
            <thead>
              <tr><th>资料</th><th>可见范围</th><th>审核</th><th>说明</th></tr>
            </thead>
            <tbody>
              {library.map((f) => (
                <tr key={f.id}>
                  <td>{f.name}</td>
                  <td><span className={`tag perm-${f.permission?.level || "private"}`}>{f.permission?.level || "-"}</span></td>
                  <td>{f.review?.status || "-"}</td>
                  <td>ABAC：角色、部门、审核状态共同判断</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {adminTab === "api-config" && (
          <div className="cfg-card">
            {/* 标题 */}
            <div className="cfg-card-hd">
              <Key size={16} />
              <span>AI 模型配置</span>
            </div>

            {/* 当前状态 */}
            <div className="cfg-status-row">
              <span className={`cfg-status-dot ${apiCfg?.hasKey ? "on" : "off"}`} />
              {apiCfg?.hasKey ? (
                <span>
                  已配置 · <code className="cfg-masked-key">{apiCfg.maskedKey}</code>
                  &nbsp;·&nbsp;{PROVIDERS.find((p) => p.value === apiCfg.provider)?.label || apiCfg.provider}
                  &nbsp;/&nbsp;{apiCfg.model}
                </span>
              ) : (
                <span style={{ color: "var(--text-hint)" }}>未配置 API Key，AI 功能暂不可用</span>
              )}
            </div>

            {/* 表单 */}
            <div className="cfg-form">
              {/* 服务商 */}
              <div className="cfg-row">
                <label className="cfg-label">服务商</label>
                <select
                  className="cfg-select"
                  value={provDraft}
                  onChange={(e) => {
                    setProvDraft(e.target.value);
                    setModelDraft(MODELS[e.target.value]?.[0]?.value || "");
                  }}
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>

              {/* 模型 */}
              <div className="cfg-row">
                <label className="cfg-label">模型</label>
                <select
                  className="cfg-select"
                  value={modelDraft}
                  onChange={(e) => setModelDraft(e.target.value)}
                >
                  {(MODELS[provDraft] || []).map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              {/* API Key */}
              <div className="cfg-row">
                <label className="cfg-label">API Key</label>
                <div className="cfg-key-wrap">
                  <input
                    className="cfg-input"
                    type={showKey ? "text" : "password"}
                    placeholder={apiCfg?.hasKey ? "留空则保留当前 Key" : "粘贴 API Key…"}
                    value={keyDraft}
                    onChange={(e) => setKeyDraft(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    className="cfg-eye-btn"
                    onClick={() => setShowKey((v) => !v)}
                    title={showKey ? "隐藏" : "显示"}
                    type="button"
                  >
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <div className="cfg-hint">
                  Key 将以 AES-256 加密后存储，界面永不展示完整内容
                </div>
              </div>
            </div>

            {/* 反馈消息 */}
            {cfgMsg && (
              <div className={`cfg-msg ${cfgMsg.ok ? "ok" : "err"}`}>
                {cfgMsg.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                {cfgMsg.text}
              </div>
            )}

            {/* 操作按钮 */}
            <div className="cfg-actions">
              {apiCfg?.hasKey && (
                <button className="btn btn-sm btn-danger" onClick={deleteApiKey}>
                  删除 Key
                </button>
              )}
              <button
                className="btn btn-primary btn-sm"
                onClick={saveApiConfig}
                disabled={cfgSaving}
              >
                {cfgSaving ? "保存中…" : "保存配置"}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
