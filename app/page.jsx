"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Database } from "lucide-react";
import { useApp } from "@/lib/AppContext";

export default function LoginPage() {
  const { session, data, loading, login } = useApp();
  const router = useRouter();
  const [loginEmail, setLoginEmail] = useState("lili@company.com");
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    if (!loading && session) {
      router.replace("/dashboard");
    }
  }, [session, loading, router]);

  async function handleLogin(email = loginEmail) {
    setLoginError("");
    const result = await login(email);
    if (!result.ok) {
      setLoginError(result.message || "登录失败");
      return;
    }
    router.push("/dashboard");
  }

  if (loading) {
    return (
      <div className="login-page">
        <div className="login-panel">加载中...</div>
      </div>
    );
  }

  const users = data?.users || [];
  const tasks = data?.tasks || [];
  const library = data?.library || [];
  const skills = data?.skills || [];
  const activeUsers = users.filter((u) => u.status === "active");
  const demoUsers = activeUsers.length ? activeUsers : users;

  return (
    <div className="login-page">
      <section className="login-panel">
        <div className="login-logo">
          <div className="logo-icon"><Database size={16} /></div>
          <div className="logo-text"><span>Content</span>AI</div>
        </div>
        <h1 className="login-title">登录企业内容创作平台</h1>
        <p className="login-sub">
          使用企业账号进入工作台。演示环境会读取你 MongoDB 中的真实用户，停用员工会被拒绝登录。
        </p>
        <div className="login-form">
          <label className="field-label">企业邮箱</label>
          <input
            className="form-input"
            value={loginEmail}
            onChange={(e) => setLoginEmail(e.target.value)}
            placeholder="name@company.com"
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          />
          <label className="field-label">密码</label>
          <input className="form-input" type="password" placeholder="演示环境暂不校验密码" />
          <button className="btn btn-primary" onClick={() => handleLogin()}>登录</button>
          <div className="login-error">{loginError}</div>
        </div>
        <div className="login-demo-list">
          {demoUsers.slice(0, 4).map((u) => (
            <button className="demo-account" key={u.id} onClick={() => handleLogin(u.email)}>
              <span>{u.name} · {u.role === "tenant_admin" ? "管理员" : "员工"}</span>
              <span className={`tag ${u.status === "active" ? "tag-done" : "tag-danger"}`}>{u.status}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="login-preview">
        <div className="login-preview-board">
          <div className="card-header">
            <div className="card-title">ContentAI MVP</div>
            <span className="tag tag-blue">MongoDB connected</span>
          </div>
          <div className="stats-grid" style={{ padding: 18, margin: 0 }}>
            <div className="stat-card"><div className="stat-label">任务</div><div className="stat-value">{tasks.length}</div></div>
            <div className="stat-card"><div className="stat-label">资料</div><div className="stat-value">{library.length}</div></div>
            <div className="stat-card"><div className="stat-label">员工</div><div className="stat-value">{users.length}</div></div>
            <div className="stat-card"><div className="stat-label">Skill</div><div className="stat-value">{skills.length}</div></div>
          </div>
        </div>
      </section>
    </div>
  );
}
