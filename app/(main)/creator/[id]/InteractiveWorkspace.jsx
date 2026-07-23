"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Copy,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  Send,
  Smartphone,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { useApp } from "@/lib/AppContext";
import { INTERACTIVE_TYPES } from "@/lib/helpers";

// ─── Save indicator ───────────────────────────────────────────────────────────
function SaveIndicator({ status, lastSavedAt, error }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  if (status === "saving")
    return (
      <span className="ws-save-indicator saving">
        <Loader2 size={11} className="spin" /> 保存中…
      </span>
    );
  if (status === "error")
    return <span className="ws-save-indicator error">{error || "保存失败"}</span>;
  if (status === "saved")
    return <span className="ws-save-indicator saved">已保存到云端</span>;
  if (lastSavedAt) {
    const diff = Math.floor((Date.now() - lastSavedAt) / 1000);
    const rel =
      diff < 10 ? "刚刚"
      : diff < 60 ? `${diff}秒前`
      : diff < 3600 ? `${Math.floor(diff / 60)}分钟前`
      : `${Math.floor(diff / 3600)}小时前`;
    return <span className="ws-save-indicator idle">上次保存于 {rel}</span>;
  }
  return null;
}

// ─── Copy button ──────────────────────────────────────────────────────────────
function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      className={`layout-copy-btn ${copied ? "copied" : ""}`}
      onClick={(e) => { e.stopPropagation(); handleCopy(); }}
      title="复制代码"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

// ─── SVG iframe preview ───────────────────────────────────────────────────────
function SvgIframe({ svgCode, phone }) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{margin:0;padding:0;box-sizing:border-box}html,body{background:#fff;overflow-x:hidden}</style></head><body>${svgCode}</body></html>`;
  const style = phone
    ? { width: 375, border: "none", minHeight: 300, maxHeight: 640, display: "block" }
    : { width: "100%", border: "none", minHeight: 300, maxHeight: 640, display: "block" };
  return <iframe srcDoc={html} style={style} title="SVG预览" scrolling="no" />;
}

// ─── Interactive workspace ────────────────────────────────────────────────────
export default function InteractiveWorkspace() {
  const { id } = useParams();
  const router = useRouter();
  const { session, data, updateTask, updateUserCredits } = useApp();

  const tasks = data?.tasks || [];
  const task = tasks.find((t) => t.id === id);

  const [interactionType, setInteractionType] = useState("hotspot");
  const [prompt, setPrompt] = useState("");
  const [pendingImages, setPendingImages] = useState([]);
  const [rounds, setRounds] = useState([]);
  const [selectedIds, setSelectedIds] = useState({});
  const [generating, setGenerating] = useState(false);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [saveError, setSaveError] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [phoneMode, setPhoneMode] = useState(true);

  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);
  const titleDebounceRef = useRef(null);

  // Sync state from task
  useEffect(() => {
    if (!task) return;
    setTitleDraft(task.title || "未命名项目");
    setInteractionType(task.interactionType || "hotspot");

    const gens = task.generations || [];
    const loadedRounds = gens.map((gen) => ({
      userMessage: gen.userMessage || { images: [], text: "", interactionType: gen.interactionType },
      candidates: gen.candidates || [],
      credits: gen.credits || 0,
      loading: false,
      error: null,
    }));
    setRounds(loadedRounds);

    const initSelected = {};
    gens.forEach((gen, idx) => {
      if (gen.selectedId) initSelected[idx] = gen.selectedId;
    });
    setSelectedIds(initSelected);
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [rounds]);

  // Title debounce save
  function handleTitleChange(val) {
    setTitleDraft(val);
    clearTimeout(titleDebounceRef.current);
    titleDebounceRef.current = setTimeout(() => saveTitle(val), 1200);
  }

  async function saveTitle(val) {
    const trimmed = val.trim();
    if (!trimmed) return;
    setSaveStatus("saving");
    const res = await fetch(`/api/creation-tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    });
    const json = await res.json();
    if (json.ok) {
      updateTask(json.task);
      setSaveStatus("saved");
      setLastSavedAt(Date.now());
      setTimeout(() => setSaveStatus("idle"), 2000);
    } else {
      setSaveStatus("error");
      setSaveError(json.message);
    }
  }

  // Image upload
  async function handleFileSelect(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      const fd = new FormData();
      fd.append("file", file);
      fd.append("userId", session?.id || "");
      fd.append("userName", session?.name || "");
      fd.append("enterpriseId", session?.enterpriseId || "");
      fd.append("category", "interactive");
      const res = await fetch("/api/file-items", { method: "POST", body: fd });
      const json = await res.json();
      if (json.ok) {
        setPendingImages((prev) => [
          ...prev,
          { fileItemId: json.fileItem.id, fileUrl: json.fileItem.fileUrl, name: json.fileItem.name },
        ]);
      }
    }
  }

  function removeImage(idx) {
    setPendingImages((prev) => prev.filter((_, i) => i !== idx));
  }

  // Generate
  async function handleGenerate() {
    if (generating) return;

    const userMessage = {
      images: [...pendingImages],
      text: prompt.trim(),
      interactionType,
    };

    const roundIndex = rounds.length;
    setRounds((prev) => [...prev, { userMessage, candidates: [], loading: true, error: null }]);
    setPendingImages([]);
    setPrompt("");
    setGenerating(true);

    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "interactive",
          prompt: userMessage.text,
          interactionType,
          imageUrls: userMessage.images.map((img) => img.fileUrl),
          taskId: id,
          userId: session?.id,
          enterpriseId: session?.enterpriseId,
          round: roundIndex + 1,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || "生成失败");

      const candidates = json.candidates || [];
      const credits = json.credits || 0;

      setRounds((prev) => {
        const updated = [...prev];
        updated[roundIndex] = { userMessage, candidates, loading: false, error: null, credits };
        return updated;
      });

      if (candidates.length > 0) {
        setSelectedIds((prev) => ({ ...prev, [roundIndex]: candidates[0].candidateId }));
      }

      // Persist generation to DB
      const genRecord = {
        round: roundIndex + 1,
        interactionType,
        userMessage,
        candidates,
        selectedId: candidates[0]?.candidateId || null,
        model: json.model,
        credits,
        createdAt: new Date().toISOString(),
      };
      const patchRes = await fetch(`/api/creation-tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pushGeneration: genRecord, status: "in_progress" }),
      });
      const patchJson = await patchRes.json();
      if (patchJson.ok) {
        updateTask(patchJson.task);
        setSaveStatus("saved");
        setLastSavedAt(Date.now());
        setTimeout(() => setSaveStatus("idle"), 2000);
      }

      if (credits) updateUserCredits(credits);
    } catch (err) {
      setRounds((prev) => {
        const updated = [...prev];
        updated[roundIndex] = { ...updated[roundIndex], loading: false, error: err.message };
        return updated;
      });
    } finally {
      setGenerating(false);
    }
  }

  const canGenerate = !generating && (pendingImages.length > 0 || prompt.trim().length > 0);

  const totalCredits = (task?.credits?.consumed || 0);

  return (
    <section className="page">
      <div className="creator-shell">
        {/* Back bar */}
        <div className="creator-back-bar">
          <button className="creator-back-btn" onClick={() => router.push("/creator")}>
            <ArrowLeft size={14} /> 返回
          </button>
          <input
            className="creator-title-input"
            value={titleDraft}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="项目标题"
          />
          <span className="tag tag-blue" style={{ fontSize: 11, padding: "1px 7px" }}>交互式图文</span>
          <div className="creator-bar-right">
            <SaveIndicator status={saveStatus} lastSavedAt={lastSavedAt} error={saveError} />
          </div>
        </div>

        {/* Subbar */}
        <div className="ix-subbar">
          <div className="ix-subbar-left">
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>预览：</span>
            <button
              className={`ix-width-btn ${phoneMode ? "active" : ""}`}
              onClick={() => setPhoneMode(true)}
            >
              <Smartphone size={12} /> 375px
            </button>
            <button
              className={`ix-width-btn ${!phoneMode ? "active" : ""}`}
              onClick={() => setPhoneMode(false)}
            >
              <Maximize2 size={12} /> 全宽
            </button>
          </div>
          {totalCredits > 0 && (
            <span className="step-credits" style={{ marginLeft: "auto" }}>已消耗 {totalCredits} credits</span>
          )}
        </div>

        {/* Chat area */}
        <div className="step-chat">
          {rounds.length === 0 && (
            <div className="chat-empty-hint">
              上传参考图并描述效果，AI 将生成微信公众号 SVG 交互式 section 代码
            </div>
          )}

          {rounds.map((round, idx) => (
            <div key={idx}>
              {/* User message */}
              <div className="msg user">
                <div className="msg-avatar">我</div>
                <div className="msg-content">
                  <div className="msg-bubble">
                    {round.userMessage.images.length > 0 && (
                      <div className="ix-img-chips">
                        {round.userMessage.images.map((img, i) => (
                          <span key={i} className="ix-img-chip">
                            <ImageIcon size={10} />
                            {img.name || `图片${i + 1}`}
                            {i === 0 && <span style={{ opacity: 0.7 }}>（主图）</span>}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="ix-interaction-badge" style={{ marginBottom: 4 }}>
                      <Zap size={10} />
                      {INTERACTIVE_TYPES.find((t) => t.key === round.userMessage.interactionType)?.label || round.userMessage.interactionType}
                    </div>
                    {round.userMessage.text && <div>{round.userMessage.text}</div>}
                  </div>
                </div>
              </div>

              {/* AI message */}
              <div className="msg ai">
                <div className="msg-avatar">AI</div>
                <div className="msg-content">
                  {round.loading ? (
                    <div className="msg-bubble ai-typing">
                      <div className="typing-dot" />
                      <div className="typing-dot" />
                      <div className="typing-dot" />
                    </div>
                  ) : round.error ? (
                    <div className="msg-bubble" style={{ color: "var(--danger)" }}>
                      生成失败：{round.error}
                    </div>
                  ) : (
                    <>
                      <div className="msg-bubble">
                        {round.candidates.length > 0
                          ? `已生成 ${round.candidates.length} 个交互式方案，点击选择。`
                          : "未能解析到有效方案，请重试。"}
                        {round.credits > 0 && (
                          <span style={{ marginLeft: 8, fontSize: 11, color: "var(--text-hint)" }}>
                            · {round.credits} credits
                          </span>
                        )}
                      </div>
                      {round.candidates.length > 0 && (
                        <div className="layout-cards">
                          {round.candidates.map((c) => {
                            const selId = selectedIds[idx];
                            const sel = selId != null
                              ? selId === c.candidateId
                              : round.candidates[0].candidateId === c.candidateId;
                            return (
                              <div
                                key={c.candidateId}
                                className={`layout-card ${sel ? "selected" : ""}`}
                                onClick={() =>
                                  setSelectedIds((prev) => ({ ...prev, [idx]: c.candidateId }))
                                }
                              >
                                <div className="layout-card-header">
                                  <div className={`layout-card-radio ${sel ? "active" : ""}`} />
                                  <span className="layout-card-title">{c.title || c.candidateId}</span>
                                  <CopyBtn text={c.section || ""} />
                                </div>
                                {c.summary && (
                                  <div className="layout-card-summary">{c.summary}</div>
                                )}
                                {c.section && (
                                  <div className="layout-iframe-wrap" style={{ textAlign: "center" }}>
                                    <SvgIframe svgCode={c.section} phone={phoneMode} />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Input area */}
        <div className="step-input-area">
          {/* Pending image previews */}
          {pendingImages.length > 0 && (
            <div className="upload-preview-area">
              {pendingImages.map((img, i) => (
                <div key={i} className="upload-preview-item">
                  <img className="upload-preview-thumb" src={img.fileUrl} alt={img.name} />
                  <div className="upload-preview-info">
                    <div className="upload-preview-name">{img.name}</div>
                    <div className="upload-preview-size">{i === 0 ? "主背景图" : `弹出层 ${i}`}</div>
                  </div>
                  <button className="upload-preview-remove" onClick={() => removeImage(i)}>
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Interaction type chips */}
          <div className="ix-type-row">
            {INTERACTIVE_TYPES.map((t) => (
              <button
                key={t.key}
                className={`ix-type-chip ${interactionType === t.key ? "active" : ""}`}
                onClick={() => setInteractionType(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Upload toolbar */}
          <div className="upload-toolbar">
            <button className="upload-btn" onClick={() => fileInputRef.current?.click()}>
              <Upload size={13} /> 上传参考图
            </button>
            {pendingImages.length === 0 && (
              <span className="upload-btn-hint">首张为主背景，后续为弹出层内容</span>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={handleFileSelect}
          />

          {/* Text input + send */}
          <div className="step-input-wrapper">
            <textarea
              className="chat-input"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (canGenerate) handleGenerate();
                }
              }}
              placeholder="描述交互效果意图，如：点击热区展开产品详情图层…"
              rows={2}
            />
            <button
              className="send-btn"
              onClick={handleGenerate}
              disabled={!canGenerate}
            >
              生成 <Zap size={14} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
