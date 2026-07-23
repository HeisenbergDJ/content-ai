"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [session, setSession] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadBootstrap = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/bootstrap", { cache: "no-store" });
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("contentai.session");
    if (saved) {
      try { setSession(JSON.parse(saved)); } catch { /* ignore */ }
    }
    loadBootstrap();
  }, [loadBootstrap]);

  async function login(email) {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const json = await res.json();
    if (!json.ok) return { ok: false, message: json.message };
    setSession(json.user);
    localStorage.setItem("contentai.session", JSON.stringify(json.user));
    return { ok: true };
  }

  function logout() {
    setSession(null);
    localStorage.removeItem("contentai.session");
  }

  // 局部更新单个 task，不触发 loading 状态，避免界面闪烁
  function updateTask(updatedTask) {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        tasks: prev.tasks.map((t) => (t.id === updatedTask.id ? updatedTask : t)),
      };
    });
  }

  // 本地扣减指定用户的 credits，用于 AI 调用后即时刷新 Topbar 显示
  function updateUserCredits(userId, creditsConsumed) {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        users: (prev.users || []).map((u) =>
          u.id === userId
            ? {
                ...u,
                credits: {
                  ...u.credits,
                  used:      (u.credits?.used      ?? 0) + creditsConsumed,
                  remaining: (u.credits?.remaining ?? 0) - creditsConsumed,
                },
              }
            : u
        ),
      };
    });
  }

  // 追加新 task 到本地状态，不触发 loadBootstrap，避免 loading 闪烁和重复挂载
  function addTask(newTask) {
    setData((prev) => {
      if (!prev) return prev;
      return { ...prev, tasks: [newTask, ...prev.tasks] };
    });
  }

  return (
    <AppContext.Provider value={{ session, data, loading, error, login, logout, loadBootstrap, updateTask, addTask, updateUserCredits }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
