"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlignLeft,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useApp } from "@/lib/AppContext";
import { STEPS, stepIndex } from "@/lib/helpers";
import InteractiveWorkspace from "./InteractiveWorkspace";

// ─── 读取文本文件内容（浏览器端 FileReader） ────────────────────────────────
function readFileText(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload  = (e) => resolve(typeof e.target?.result === "string" ? e.target.result : "");
    reader.onerror = () => resolve("");
    reader.readAsText(file, "UTF-8");
  });
}

function isTextFileMime(mimeType = "", name = "") {
  return (
    /^text\//.test(mimeType) ||
    /^application\/(json|xml|yaml)/.test(mimeType) ||
    /\.(txt|md|csv|json|jsonl|xml|yaml|yml|log)$/i.test(name)
  );
}

// ─── 自动构造首轮 user prompt（根据上一步确认结果） ───────────────────────────
// 返回 { apiPrompt, displayText }：apiPrompt 发给 AI，displayText 展示在聊天里
function buildAutoPrompt(stepKey, prevSelected) {
  if (!prevSelected) return null;

  if (prevSelected.type === "image_plan") {
    const heroSection   = prevSelected.imageSections?.find((s) => s.sectionId === "hero");
    const footerSection = prevSelected.imageSections?.find((s) => s.sectionId === "footer");

    const heroSel  = heroSection?.candidates?.find((c) => c.candidateId === heroSection.selectedId) ?? heroSection?.candidates?.[0];
    const heroLine = heroSel
      ? `  · 头图方案：${heroSel.title}\n    ${heroSel.description || ""}`
      : "";

    const footerLines = [];
    const logoUrl = footerSection?.logoFileItem?.fileUrl || "";
    const qrUrl   = footerSection?.qrFileItem?.fileUrl   || "";
    if (logoUrl) footerLines.push(`  · 品牌Logo图片：${logoUrl}`);
    if (qrUrl)   footerLines.push(`  · 二维码图片：${qrUrl}`);
    if (!logoUrl && !qrUrl)
      footerLines.push("  · 尾图素材：未上传，尾部区域可留空");

    const lines = [heroLine, ...footerLines].filter(Boolean).join("\n");

    return {
      apiPrompt:   `基于已确认的配图方案：\n${lines}\n\n请整合以上文案内容与配图方案，完成公众号排版输出。如有品牌Logo或二维码图片URL，请用 <img> 标签直接嵌入 HTML 尾部区域。`,
      displayText: "已确认配图方案，正在生成排版输出…",
    };
  }

  const title      = prevSelected.title ?? "";
  const cleanTitle = title.replace(/^(方向|版本)[A-Za-z一-龥]：/, "").trim() || title;
  const desc       = prevSelected.description ?? prevSelected.summary ?? "";
  const descLine   = desc ? `\n${desc}` : "";

  const sectionsText = prevSelected.sections?.length > 0
    ? "\n\n正文内容：\n" + prevSelected.sections
        .map((s) => `【${s.heading}】\n${s.content}`)
        .join("\n\n")
    : "";

  // 上一步用户上传的文本附件内容（选题→文案 时携带）
  const attachBlock = prevSelected.attachmentTexts
    ? `\n\n参考资料：\n${prevSelected.attachmentTexts}`
    : "";

  const stepLabel = { copywriting: "文案撰写", image_plan: "切图设计", layout: "排版输出" }[stepKey] || "";

  const templates = {
    copywriting: `基于已确认的选题方向：\n【${title}】${descLine}${attachBlock}\n\n请围绕以上选题撰写公众号图文文案，风格专业且有感染力，适合企业公众号发布。`,
    image_plan:  `基于已确认的文案版本：\n【${title}】${descLine}${sectionsText}\n\n请根据以上文案内容，规划公众号配图方案，包括头图设计方案和尾图。`,
    layout:      `基于已确认的文案版本：\n【${title}】${sectionsText}\n\n请整合以上文案与配图方案，完成公众号排版输出。`,
  };

  return {
    apiPrompt:   templates[stepKey] ?? `基于上一步确认结果【${title}】，请继续生成内容。`,
    displayText: `已选：《${cleanTitle}》，正在生成${stepLabel}方案…`,
  };
}

// ─── Save status indicator ────────────────────────────────────────────────────
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
      diff < 10
        ? "刚刚"
        : diff < 60
        ? `${diff}秒前`
        : diff < 3600
        ? `${Math.floor(diff / 60)}分钟前`
        : `${Math.floor(diff / 3600)}小时前`;
    return <span className="ws-save-indicator idle">上次修改于 {rel}</span>;
  }
  return null;
}

// ─── AI message with selectable candidates ────────────────────────────────────
// locked=true 时卡片只读；candidates 含 article 字段时支持展开/收起正文
function AiMessage({ text, candidates, selectedId, onSelect, locked }) {
  const [expandedIds, setExpandedIds] = useState(new Set());

  function toggleExpand(e, id) {
    e.stopPropagation();
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="msg ai">
      <div className="msg-avatar">AI</div>
      <div className="msg-content">
        <div className="msg-bubble">{text}</div>
        {candidates.length > 0 && (
          <div className="option-cards">
            {candidates.map((c, i) => {
              const sel = selectedId != null ? selectedId === c.candidateId : i === 0;
              const isExpanded = expandedIds.has(c.candidateId);
              return (
                <div
                  key={c.candidateId || i}
                  className={`option-card ${sel ? "selected" : ""} ${locked ? "locked" : ""}`}
                  onClick={() => !locked && onSelect(c.candidateId)}
                  role={locked ? undefined : "button"}
                  tabIndex={locked ? undefined : 0}
                  onKeyDown={(e) => !locked && e.key === "Enter" && onSelect(c.candidateId)}
                >
                  <div className="option-card-radio" />
                  <div className="option-card-body">
                    <div className="option-card-title-row">
                      <span className="option-card-title">{c.title || c.candidateId}</span>
                      {c.sections?.length > 0 && (
                        <button
                          className="option-card-expand-btn"
                          onClick={(e) => toggleExpand(e, c.candidateId)}
                        >
                          {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          {isExpanded ? "收起" : "展开全文"}
                        </button>
                      )}
                    </div>
                    <div className="option-card-desc">
                      {c.summary || c.description || c.fullText || "候选内容已生成。"}
                    </div>
                    {c.sections?.length > 0 && isExpanded && (
                      <div className="option-card-article">
                        {c.sections.map((s, si) => (
                          <div key={si} className="article-section">
                            <div className="article-section-heading">{s.heading}</div>
                            <p className="article-section-content">{s.content}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="option-card-tags">
                      {(c.tags || []).map((t) => (
                        <span className="option-card-tag" key={t}>{t}</span>
                      ))}
                      <span className="option-card-tag">round {c.round || 1}</span>
                    </div>
                  </div>
                  {locked && sel && (
                    <CheckCircle2 size={14} style={{ color: "var(--primary)", flexShrink: 0, marginTop: 2 }} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Image plan message (步骤三专用) ──────────────────────────────────────────
function FooterUploadSection({ section, onUpdateSection, locked, session }) {
  const [logoUploading, setLogoUploading] = useState(false);
  const [qrUploading,   setQrUploading]   = useState(false);
  // pickerTarget: "logoFileItem" | "qrFileItem" | null
  const [pickerTarget,  setPickerTarget]  = useState(null);
  const logoRef = useRef(null);
  const qrRef   = useRef(null);

  async function handleUpload(file, field, setUploading) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file",         file);
      form.append("userId",       session?.id           || "");
      form.append("userName",     session?.name         || "");
      form.append("enterpriseId", session?.enterpriseId || "");
      const res  = await fetch("/api/file-items", { method: "POST", body: form });
      const json = await res.json();
      if (json.ok && json.fileItem) {
        onUpdateSection(section.sectionId, { [field]: json.fileItem });
      }
    } finally {
      setUploading(false);
    }
  }

  function handleLibraryConfirm(attachments) {
    const item = attachments[0];
    if (!item || !pickerTarget) return;
    onUpdateSection(section.sectionId, {
      [pickerTarget]: {
        id:       item.fileItemId,
        fileUrl:  item.fileUrl,
        name:     item.name,
        size:     item.size,
        mimeType: item.mimeType,
      },
    });
    setPickerTarget(null);
  }

  function UploadField({ label, fieldKey, fileItem, uploading, setUploading, inputRef, accept }) {
    return (
      <div className="footer-upload-item">
        <div className="footer-upload-label">{label} <span className="footer-upload-optional">（选填）</span></div>
        {fileItem ? (
          <div className="footer-upload-preview">
            <img src={fileItem.fileUrl} alt={label} className="footer-upload-img" />
            {!locked && (
              <button className="footer-upload-remove" onClick={() => onUpdateSection(section.sectionId, { [fieldKey]: null })}>
                <X size={12} />
              </button>
            )}
          </div>
        ) : (
          <div className="footer-upload-btns">
            <button
              className="footer-upload-btn"
              onClick={() => inputRef.current?.click()}
              disabled={locked || uploading}
            >
              {uploading ? <Loader2 size={13} className="spin" /> : <Upload size={13} />}
              上传图片
            </button>
            <button
              className="footer-upload-btn"
              onClick={() => !locked && setPickerTarget(fieldKey)}
              disabled={locked}
            >
              <FolderOpen size={13} /> 从素材库选择
            </button>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) handleUpload(f, fieldKey, setUploading);
          }}
        />
      </div>
    );
  }

  return (
    <>
      <div className="ip-section">
        <div className="ip-section-label">
          <ImageIcon size={12} />
          {section.label}
          <span className="ip-section-dim">（{section.dimensions}）</span>
        </div>
        <div className="footer-upload-row">
          <UploadField
            label="品牌 Logo"
            fieldKey="logoFileItem"
            fileItem={section.logoFileItem}
            uploading={logoUploading}
            setUploading={setLogoUploading}
            inputRef={logoRef}
            accept="image/*,.svg"
          />
          <UploadField
            label="二维码"
            fieldKey="qrFileItem"
            fileItem={section.qrFileItem}
            uploading={qrUploading}
            setUploading={setQrUploading}
            inputRef={qrRef}
            accept="image/*"
          />
        </div>
      </div>

      {pickerTarget && (
        <MaterialPickerModal
          session={session}
          imageOnly
          singleSelect
          onConfirm={handleLibraryConfirm}
          onClose={() => setPickerTarget(null)}
        />
      )}
    </>
  );
}

function ImagePlanSection({ section, onSelect, onUpdateSection, locked, session }) {
  if (section.sectionType === "upload") {
    return (
      <FooterUploadSection
        section={section}
        onUpdateSection={onUpdateSection}
        locked={locked}
        session={session}
      />
    );
  }

  return (
    <div className="ip-section">
      <div className="ip-section-label">
        <ImageIcon size={12} />
        {section.label}
        <span className="ip-section-dim">（{section.dimensions}）</span>
      </div>
      <div className="ip-candidates">
        {section.candidates.map((c) => {
          const sel =
            (section.selectedId ?? section.candidates[0]?.candidateId) === c.candidateId;
          return (
            <div
              key={c.candidateId}
              className={`ip-card ${sel ? "selected" : ""} ${locked ? "locked" : ""}`}
              onClick={() => !locked && onSelect(section.sectionId, c.candidateId)}
            >
              <div className={`ip-radio ${sel ? "active" : ""}`} />

              {c.previewGradient ? (
                <div className="ip-preview" style={{ background: c.previewGradient }}>
                  {c.previewLines && (
                    <div className="ip-preview-lines">
                      {c.previewLines.map((l, i) => (
                        <div key={i}>{l}</div>
                      ))}
                    </div>
                  )}
                </div>
              ) : c.icon ? (
                <div className="ip-icon-preview">
                  {c.icon === "ai" && (
                    <div className="ip-ai-pattern">
                      {["#4F46E5", "#34D399", "#F59E0B"].map((bg, i) => (
                        <div
                          key={i}
                          className="ip-ai-block"
                          style={{ background: bg, opacity: 0.85 - i * 0.15 }}
                        />
                      ))}
                    </div>
                  )}
                  {c.icon === "library" && (
                    <div className="ip-library-icon">
                      <FolderOpen size={22} style={{ color: "var(--text-secondary)" }} />
                      <span>资料库素材</span>
                    </div>
                  )}
                  {c.icon === "text" && (
                    <div className="ip-text-pattern">
                      {[80, 100, 65, 90].map((w, i) => (
                        <div key={i} className="ip-text-line" style={{ width: `${w}%` }} />
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              <div className="ip-card-body">
                <div className="ip-card-title">
                  {c.title}
                  {c.tag && <span className="ip-card-tag">{c.tag}</span>}
                </div>
                <div className="ip-card-desc">{c.description}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ImagePlanMessage({ text, imageSections, onSelect, onUpdateSection, onRegenerate, locked, session }) {
  return (
    <div className="msg ai">
      <div className="msg-avatar">AI</div>
      <div className="msg-content">
        <div className="msg-bubble">{text}</div>
        <div className="ip-wrap">
          {imageSections.map((section) => (
            <ImagePlanSection
              key={section.sectionId}
              section={section}
              onSelect={onSelect}
              onUpdateSection={onUpdateSection}
              locked={locked}
              session={session}
            />
          ))}
          {!locked && (
            <div className="ip-actions">
              <button className="ip-action-btn" onClick={onRegenerate}>
                <RefreshCw size={12} /> 重新生成全部
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 素材库选择器弹窗 ──────────────────────────────────────────────────────────
function MaterialPickerModal({
  session,
  onConfirm,
  onClose,
  textOnly   = false,
  imageOnly  = false,
  singleSelect = false,
}) {
  const [fileItems,   setFileItems]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [searchQ,     setSearchQ]     = useState("");
  const [filterCat,   setFilterCat]   = useState("__all__");

  useEffect(() => {
    if (!session?.enterpriseId) { setLoading(false); return; }
    fetch(`/api/file-items?enterpriseId=${session.enterpriseId}`)
      .then((r) => r.json())
      .then((j) => { if (j.ok) setFileItems(j.fileItems || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session?.enterpriseId]);

  // 按 textOnly / imageOnly 过滤
  const visibleItems = useMemo(() => {
    if (textOnly)  return fileItems.filter((f) => isTextFileMime(f.mimeType, f.name));
    if (imageOnly) return fileItems.filter((f) => f.mimeType?.startsWith("image/") || /\.svg$/i.test(f.name));
    return fileItems;
  }, [fileItems, textOnly, imageOnly]);

  // 所有分类（基于 visibleItems）
  const allCats = useMemo(
    () => [...new Set(visibleItems.map((f) => f.category).filter(Boolean))].sort(),
    [visibleItems]
  );

  // 过滤后的列表
  const filteredItems = useMemo(() => {
    let items =
      filterCat === "__all__"
        ? visibleItems
        : visibleItems.filter((f) => f.category === filterCat);
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      items = items.filter((f) => f.name.toLowerCase().includes(q));
    }
    return items;
  }, [visibleItems, filterCat, searchQ]);

  function toggle(id) {
    setSelectedIds((prev) => {
      if (singleSelect) return new Set([id]); // 单选：直接替换
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleConfirm() {
    const selected = visibleItems.filter((f) => selectedIds.has(f.id));
    const attachments = selected.map((f) => ({
      fileItemId:  f.id,
      fileUrl:     f.fileUrl,
      name:        f.name,
      size:        f.size,
      mimeType:    f.mimeType,
      fromLibrary: true,
    }));
    onConfirm(attachments);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="material-picker-box" onClick={(e) => e.stopPropagation()}>
        {/* 头部 */}
        <div className="material-picker-header">
          <span className="material-picker-title">从素材库选择</span>
          {selectedIds.size > 0 && (
            <span className="material-picker-count">已选 {selectedIds.size} 个</span>
          )}
          <button className="material-picker-close" onClick={onClose}><X size={16} /></button>
        </div>

        {/* 筛选栏：搜索 + 分类 tabs */}
        {!loading && visibleItems.length > 0 && (
          <div className="mp-filter-bar">
            <div className="search-wrapper" style={{ flex: "0 0 220px" }}>
              <Search size={13} />
              <input
                className="search-input"
                placeholder="搜索素材名称…"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
              />
            </div>
            <div className="mp-cat-tabs">
              <button
                className={`mp-cat-tab ${filterCat === "__all__" ? "active" : ""}`}
                onClick={() => setFilterCat("__all__")}
              >
                全部
                <span className="mp-cat-count">{visibleItems.length}</span>
              </button>
              {allCats.map((cat) => (
                <button
                  key={cat}
                  className={`mp-cat-tab ${filterCat === cat ? "active" : ""}`}
                  onClick={() => setFilterCat(cat)}
                >
                  {cat}
                  <span className="mp-cat-count">
                    {visibleItems.filter((f) => f.category === cat).length}
                  </span>
                </button>
              ))}
              {visibleItems.some((f) => !f.category) && (
                <button
                  className={`mp-cat-tab ${filterCat === "__uncategorized__" ? "active" : ""}`}
                  onClick={() => setFilterCat("__uncategorized__")}
                >
                  未分类
                  <span className="mp-cat-count">
                    {visibleItems.filter((f) => !f.category).length}
                  </span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* 内容 */}
        <div className="material-picker-body">
          {loading ? (
            <div className="material-picker-placeholder">
              <Loader2 size={18} className="spin" /> 加载素材库…
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="material-picker-placeholder">
              {textOnly  ? "素材库暂无文本文件，请先在资源中心上传 txt/md/csv/json 等文件"
               : imageOnly ? "素材库暂无图片，请先在资源中心上传图片素材"
               : "素材库暂无文件，请先在资源中心上传素材"}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="material-picker-placeholder">
              {searchQ ? "未找到匹配的素材" : "该分类暂无素材"}
            </div>
          ) : (
            <div className="material-picker-grid">
              {filteredItems.map((f) => {
                const sel = selectedIds.has(f.id);
                const isImage = f.mimeType?.startsWith("image/");
                return (
                  <div
                    key={f.id}
                    className={`mp-item ${sel ? "selected" : ""}`}
                    onClick={() => toggle(f.id)}
                  >
                    <div className={`mp-item-check ${sel ? "active" : ""}`}>
                      {sel && <Check size={10} />}
                    </div>
                    <div className="mp-item-preview">
                      {isImage && f.fileUrl ? (
                        <img src={f.fileUrl} alt={f.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <Paperclip size={20} style={{ color: "var(--text-secondary)" }} />
                      )}
                    </div>
                    <div className="mp-item-name" title={f.name}>{f.name}</div>
                    {f.category && (
                      <div className="mp-item-cat">{f.category}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 底部操作 */}
        <div className="material-picker-footer">
          <span style={{ fontSize: 12, color: "var(--text-hint)" }}>
            {filteredItems.length} 个素材
            {searchQ || filterCat !== "__all__" ? `（已过滤）` : ""}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose}>取消</button>
            <button
              className="btn btn-primary"
              onClick={handleConfirm}
              disabled={selectedIds.size === 0}
            >
              确认添加 {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Layout step: iframe preview + candidate cards ───────────────────────────
// 将服务端错误信息映射为用户可读的聊天提示
function resolveAiError(serverMsg = "") {
  if (serverMsg.includes("API Key 尚未配置") || serverMsg.includes("不存在或未启用") || serverMsg.includes("模型配置"))
    return "模型配置加载失败，请联系管理员处理。";
  if (serverMsg.includes("credits") || serverMsg.includes("余额") || serverMsg.includes("quota"))
    return "Credits 已达上限，请联系管理员充值后继续使用。";
  if (serverMsg.includes("rate limit") || serverMsg.includes("429"))
    return "AI 接口请求过于频繁，请稍后再试。";
  if (serverMsg.includes("timeout") || serverMsg.includes("ETIMEDOUT"))
    return "AI 接口响应超时，请稍后重试。";
  return `AI 调用失败，请稍后重试。${serverMsg ? `（${serverMsg}）` : ""}`;
}

function wrapSectionHtml(section) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'PingFang SC','Microsoft YaHei',Helvetica,sans-serif;background:#fff;color:#333;}</style></head><body>${section}</body></html>`;
}

function LayoutIframe({ section }) {
  const ref = useRef(null);
  function handleLoad() {
    try {
      const doc = ref.current?.contentDocument;
      if (doc) ref.current.style.height = doc.documentElement.scrollHeight + "px";
    } catch {}
  }
  return (
    <iframe
      ref={ref}
      srcDoc={wrapSectionHtml(section)}
      sandbox="allow-same-origin"
      scrolling="no"
      style={{ width: "100%", border: "none", display: "block", minHeight: 120, background: "#fff" }}
      onLoad={handleLoad}
    />
  );
}

function LayoutPreviewMessage({ text, candidates, selectedId, onSelect, locked }) {
  const [copiedId, setCopiedId] = useState(null);

  async function handleCopy(candidateId, section) {
    try {
      await navigator.clipboard.writeText(section);
      setCopiedId(candidateId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  }

  return (
    <div className="msg ai">
      <div className="msg-avatar">AI</div>
      <div className="msg-content">
        <div className="msg-bubble">{text}</div>
        <div className="layout-cards">
          {candidates.map((c, i) => {
            const sel = selectedId != null ? selectedId === c.candidateId : i === 0;
            const copied = copiedId === c.candidateId;
            return (
              <div
                key={c.candidateId}
                className={`layout-card ${sel ? "selected" : ""} ${locked ? "locked" : ""}`}
                onClick={() => !locked && onSelect(c.candidateId)}
              >
                <div className="layout-card-header">
                  <div className={`layout-card-radio ${sel ? "active" : ""}`} />
                  <span className="layout-card-title">{c.title}</span>
                  {/* 复制 section 源码按钮 */}
                  <button
                    className={`layout-copy-btn ${copied ? "copied" : ""}`}
                    onClick={(e) => { e.stopPropagation(); handleCopy(c.candidateId, c.section); }}
                    title={copied ? "已复制！" : "复制排版代码"}
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                  {locked && sel && (
                    <CheckCircle2 size={13} style={{ color: "var(--primary)", flexShrink: 0 }} />
                  )}
                </div>
                {c.summary && <p className="layout-card-summary">{c.summary}</p>}
                <div className="layout-iframe-wrap">
                  <LayoutIframe section={c.section} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Workspace page ───────────────────────────────────────────────────────────
export default function CreatorWorkspacePage() {
  const { id }    = useParams();
  const router    = useRouter();
  const { session, data, updateTask, addTask, updateUserCredits } = useApp();
  const isNew = id === "new";

  const tasks       = data?.tasks || [];
  const task        = isNew ? null : tasks.find((t) => t.id === id);
  const users       = data?.users || [];
  const currentUser = users.find((u) => u.id === session?.id) || session;
  const canAdmin    = currentUser?.role === "tenant_admin" || currentUser?.role === "super_admin";
  const isArchived  = task?.status === "archived";

  const [creating,    setCreating]    = useState(isNew);
  const [activeStep,  setActiveStep]  = useState("topic");
  const [titleDraft,  setTitleDraft]  = useState("");
  const [prompt,      setPrompt]      = useState("");
  const [round,       setRound]       = useState(1);
  const [attachments, setAttachments] = useState([]);
  const [messages,    setMessages]    = useState([]);
  const [saveStatus,  setSaveStatus]  = useState("idle");
  const [saveError,   setSaveError]   = useState("");
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [generating,         setGenerating]         = useState(false);
  const [showMaterialPicker, setShowMaterialPicker]  = useState(false);
  const [resetConfirmStep,   setResetConfirmStep]    = useState(null); // 待确认的重置目标步骤 key

  const chatEndRef       = useRef(null);
  const saveTimerRef     = useRef(null);
  const titleDebounceRef = useRef(null);
  const fileInputRef     = useRef(null);
  const creatingRef           = useRef(false);  // 防止 Strict Mode 双次调用重复创建
  const autoTriggeredStepsRef = useRef(new Set()); // 记录已自动触发过的步骤，防止重复
  // 按步骤缓存聊天记录，切换步骤时保存/恢复
  const stepMessagesRef  = useRef({});

  const stateRef = useRef({ activeStep, titleDraft, prompt, currentId: isNew ? null : id, messages });
  useEffect(() => {
    stateRef.current = {
      activeStep,
      titleDraft,
      prompt,
      currentId: task?.id ?? stateRef.current.currentId,
      messages,
    };
  }, [activeStep, titleDraft, prompt, task?.id, messages]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Create DB record immediately when entering "new" route
  useEffect(() => {
    if (!isNew) return;
    if (!session?.id || !session?.enterpriseId) return;
    if (creatingRef.current) return; // 防止 Strict Mode 双次调用
    creatingRef.current = true;
    (async () => {
      setCreating(true);
      try {
        const res = await fetch("/api/creation-tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId:       session.id,
            userName:     session.name,
            enterpriseId: session.enterpriseId,
          }),
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.message);
        // 用 addTask 直接追加到本地状态，避免 loadBootstrap 触发 loading=true
        // 导致 layout 卸载/重挂载 children 从而再次触发本 effect
        addTask(json.task);
        router.replace(`/creator/${json.task.id}`);
      } catch {
        router.replace("/creator");
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync workspace state when resolved task changes
  useEffect(() => {
    if (!task) return;
    const step = task.currentStep || "topic";
    const savedMessages = task.steps?.[step]?.messages || [];
    stepMessagesRef.current = {};
    stepMessagesRef.current[step] = savedMessages;
    setActiveStep(step);
    setTitleDraft(task.title || "未命名项目");
    setMessages(savedMessages);
    setRound(savedMessages.filter((m) => m.role === "ai").length + 1);
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedStepIndex = stepIndex(activeStep);
  const currentStep = STEPS.find((s) => s.key === activeStep) || STEPS[0];
  const isTextStep  = activeStep === "topic" || activeStep === "copywriting";

  // 用户曾到达的最远步骤（兼容旧数据：用 currentStepIndex - 1 兜底）
  const maxReachedStepIndex = task?.maxReachedStepIndex ?? Math.max(0, (task?.currentStepIndex ?? 1) - 1);
  // 当前查看的是已完成的旧步骤（frontier 之前）
  const isViewingPastStep = selectedStepIndex < maxReachedStepIndex;
  // 当前步骤是否有 AI 回复（用于控制"下一步"按钮是否可点）
  const hasAiResponse = messages.some(
    (m) => m.role === "ai" && (m.candidates?.length > 0 || m.type === "image_plan" || m.type === "layout")
  );

  // 找到最后一条含候选项的 AI 消息的索引，其余锁定（兼容 image_plan 分组格式）
  const lastAiCandidatesIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "ai" && (m.candidates?.length > 0 || m.type === "image_plan" || m.type === "layout")) return i;
    }
    return -1;
  })();

  // 保存前过滤掉仍在上传中的附件（只保留已成功上传、有 fileItemId 的）
  function stripAttachmentData(atts = []) {
    return atts.filter((a) => !a.uploading && !a.tempId);
  }

  // Auto-save
  async function autoSave(overrides = {}) {
    const { currentId: tid, activeStep: step, titleDraft: title, messages: msgs } =
      stateRef.current;
    if (!tid) return;

    const stepIdx = stepIndex(step);
    setSaveStatus("saving");
    setSaveError("");
    clearTimeout(saveTimerRef.current);

    try {
      const payload = {
        title:            overrides.title            ?? title,
        currentStep:      overrides.currentStep      ?? step,
        currentStepIndex: overrides.currentStepIndex ?? stepIdx + 1,
        status:           overrides.status ?? (task?.status === "draft" ? "draft" : "in_progress"),
      };
      if (overrides.selectedCandidateId !== undefined)
        payload.selectedCandidateId = overrides.selectedCandidateId;
      if (overrides.prevSelected !== undefined)
        payload.prevSelected = overrides.prevSelected;
      if (overrides.maxReachedStepIndex !== undefined)
        payload.maxReachedStepIndex = overrides.maxReachedStepIndex;

      // 将当前步骤的消息存入 DB（附件去掉 base64，只留元数据）
      // messagesOverride 用于在 setMessages 尚未更新 stateRef 时直接传入最新消息
      const msgsToSave = overrides.messagesOverride ?? msgs;
      payload.stepMessages = {
        step,
        messages: msgsToSave.map((m) => ({
          ...m,
          attachments: stripAttachmentData(m.attachments),
        })),
      };

      const res  = await fetch(`/api/creation-tasks/${tid}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) {
        setSaveStatus("error");
        setSaveError(json.message || "保存失败");
        return;
      }
      setLastSavedAt(Date.now());
      setSaveStatus("saved");
      saveTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
      if (json.task) updateTask(json.task);
    } catch (e) {
      setSaveStatus("error");
      setSaveError(e.message || "保存失败");
    }
  }

  // Debounced title save
  function handleTitleChange(e) {
    const val = e.target.value;
    setTitleDraft(val);
    clearTimeout(titleDebounceRef.current);
    titleDebounceRef.current = setTimeout(() => autoSave({ title: val }), 800);
  }

  // 从当前步骤 messages 里找出已选中的 candidate 对象（兼容 image_plan 分组格式）
  function getSelectedCandidate() {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.type === "image_plan" && m.imageSections?.length > 0) {
        return {
          type: "image_plan",
          title: m.imageSections
            .map((s) => {
              const sel = s.candidates.find((c) => c.candidateId === s.selectedId) ?? s.candidates[0];
              return `${s.label}：${sel?.title ?? "-"}`;
            })
            .join("，"),
          imageSections: m.imageSections,
        };
      }
      if (m.role === "ai" && m.candidates?.length > 0) {
        return m.candidates.find((c) => c.candidateId === m.selectedId) ?? m.candidates[0];
      }
    }
    return null;
  }

  // 切换步骤时保存/恢复各步骤的聊天记录
  async function handleStepChange(newStep) {
    if (newStep === activeStep) return;
    const newStepIdx  = stepIndex(newStep);
    const isAdvancing = newStepIdx > selectedStepIndex;
    stepMessagesRef.current[activeStep] = messages;

    // 只有在 frontier 向前推进时才写入 prevSelected 和 maxReachedStepIndex
    const isAtFrontier = selectedStepIndex >= maxReachedStepIndex;
    const prevSelectedPayload = (isAdvancing && isAtFrontier)
      ? (() => {
          const c = getSelectedCandidate();
          if (!c) return undefined;
          const attachmentTexts = messages
            .filter((m) => m.role === "user")
            .flatMap((m) => m.attachments || [])
            .filter((a) => a.textContent)
            .map((a) => `【${a.name}】\n${a.textContent}`)
            .join("\n\n");
          return { step: newStep, candidate: { ...c, ...(attachmentTexts ? { attachmentTexts } : {}) } };
        })()
      : undefined;

    await autoSave({
      currentStep:          newStep,
      currentStepIndex:     newStepIdx + 1,
      prevSelected:         prevSelectedPayload,
      // 前进时更新最远步骤记录
      ...(isAdvancing && newStepIdx > maxReachedStepIndex
        ? { maxReachedStepIndex: newStepIdx }
        : {}),
    });
    setActiveStep(newStep);
    const restored =
      stepMessagesRef.current[newStep] ??
      task?.steps?.[newStep]?.messages ??
      [];
    setMessages(restored);
    setRound(restored.filter((m) => m.role === "ai").length + 1);
  }

  // 从指定步骤重新开始：清除该步骤之后的所有数据
  async function handleResetFromStep(stepKey) {
    setResetConfirmStep(null);
    const resetIdx = stepIndex(stepKey);
    const tid = stateRef.current.currentId;
    if (!tid) return;

    setSaveStatus("saving");
    try {
      const res  = await fetch(`/api/creation-tasks/${tid}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ resetFromStep: stepKey }),
      });
      const json = await res.json();
      if (!json.ok) { setSaveStatus("error"); setSaveError(json.message || "重置失败"); return; }
      if (json.task) updateTask(json.task);
      setSaveStatus("saved");
      saveTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (e) {
      setSaveStatus("error"); setSaveError(e.message || "重置失败"); return;
    }

    // 清除本地内存中后续步骤的缓存
    for (let i = resetIdx + 1; i < STEPS.length; i++) {
      delete stepMessagesRef.current[STEPS[i].key];
    }
    // 清除当前步骤的 prevSelected 记忆（避免重新触发自动生成）
    autoTriggeredStepsRef.current.delete(stepKey);

    // 切换到重置步骤，恢复该步骤的历史消息
    setActiveStep(stepKey);
    const restored = stepMessagesRef.current[stepKey] ?? task?.steps?.[stepKey]?.messages ?? [];
    setMessages(restored);
    setRound(restored.filter((m) => m.role === "ai").length + 1);
  }

  // File upload：选文件后立即上传到 /api/file-items，附件存 fileItemId 引用（不存 base64）
  async function handleFileChange(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;

    const textStep = stateRef.current.activeStep === "topic" || stateRef.current.activeStep === "copywriting";

    for (const file of files) {
      const tempId = `tmp_${Date.now()}_${Math.random()}`;
      setAttachments((p) => [
        ...p,
        { tempId, name: file.name, size: file.size, mimeType: file.type, uploading: true },
      ]);

      try {
        // 文本步骤：先读取文件内容，再上传
        const textContent = textStep ? await readFileText(file) : undefined;

        const form = new FormData();
        form.append("file",         file);
        form.append("userId",       session?.id           || "");
        form.append("userName",     session?.name         || "");
        form.append("enterpriseId", session?.enterpriseId || "");

        const res  = await fetch("/api/file-items", { method: "POST", body: form });
        const json = await res.json();

        if (json.ok && json.fileItem) {
          setAttachments((p) =>
            p.map((a) =>
              a.tempId === tempId
                ? {
                    fileItemId:  json.fileItem.id,
                    fileUrl:     json.fileItem.fileUrl,
                    name:        json.fileItem.name,
                    size:        json.fileItem.size,
                    mimeType:    json.fileItem.mimeType,
                    ...(textContent !== undefined ? { textContent } : {}),
                  }
                : a
            )
          );
        } else {
          setAttachments((p) => p.filter((a) => a.tempId !== tempId));
          console.error("File upload failed:", json.message);
        }
      } catch (err) {
        setAttachments((p) => p.filter((a) => a.tempId !== tempId));
        console.error("File upload error:", err);
      }
    }
  }

  function fmtSize(b) {
    return b < 1024
      ? `${b}B`
      : b < 1_048_576
      ? `${(b / 1024).toFixed(1)}KB`
      : `${(b / 1_048_576).toFixed(1)}MB`;
  }

  // 从当前步骤最后一条 AI 消息里，找到用户当前选中的候选项标题
  // 用于多轮追问时把已选上下文注入 prompt
  function getLastSelectedLabel() {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.type === "image_plan" && m.imageSections?.length > 0) {
        return m.imageSections
          .map((s) => {
            const sel = s.candidates.find((c) => c.candidateId === s.selectedId) ?? s.candidates[0];
            return `${s.label}：${sel?.title ?? "-"}`;
          })
          .join("；");
      }
      if (m.role === "ai" && m.candidates?.length > 0) {
        const sel = m.candidates.find((c) => c.candidateId === m.selectedId) ?? m.candidates[0];
        return sel?.title ?? "";
      }
    }
    return "";
  }

  // Generate
  // promptOverride：自动首轮注入的 apiPrompt（不影响输入框）
  // displayOverride：自动首轮在聊天里展示的短文本（Option A 样式）
  async function runGenerate(promptOverride = null, displayOverride = null) {
    const sentPrompt = (promptOverride ?? prompt).trim();
    if (!sentPrompt || generating) return;

    const sentFiles    = promptOverride ? [] : [...attachments];
    const contextLabel = promptOverride ? "" : getLastSelectedLabel();

    // 构建发给 AI 的富 prompt（仅限选题/文案步骤拼接附件文本）
    let apiPrompt;
    if (promptOverride) {
      apiPrompt = sentPrompt; // 自动触发时已经是完整 prompt
    } else {
      const isTS = stateRef.current.activeStep === "topic" || stateRef.current.activeStep === "copywriting";
      const attachmentBlock = isTS
        ? sentFiles
            .filter((f) => f.textContent)
            .map((f) => `【附件：${f.name}】\n${f.textContent}`)
            .join("\n\n")
        : "";
      const parts = [];
      if (contextLabel) parts.push(`当前已选：${contextLabel}`);
      if (attachmentBlock) parts.push(`参考资料：\n${attachmentBlock}`);
      parts.push(contextLabel || attachmentBlock ? `用户要求：${sentPrompt}` : sentPrompt);
      apiPrompt = parts.join("\n\n");
    }

    // displayText：聊天气泡里展示的内容——只显示用户原始输入或跨步骤摘要
    const displayText = displayOverride ?? sentPrompt;

    // 先用 stateRef 拿到当前 messages（同步，无需等 React re-render）
    const prevMsgs = stateRef.current.messages;
    const userMsg  = { role: "user", text: displayText, contextLabel, attachments: sentFiles, auto: !!promptOverride };
    const msgsWithUser = [...prevMsgs, userMsg];

    setMessages(msgsWithUser);
    if (!promptOverride) { setPrompt(""); setAttachments([]); }
    setGenerating(true);

    try {
      const accumulatedContext = {
        topic:       task?.steps?.copywriting?.prevSelected ?? null,
        copywriting: task?.steps?.image_plan?.prevSelected  ?? null,
        image_plan:  task?.steps?.layout?.prevSelected      ?? null,
      };

      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: activeStep, round, prompt: apiPrompt,
          prevStepResult: task?.steps?.[activeStep]?.prevSelected ?? null,
          accumulatedContext,
          taskId:       task?.id          ?? null,
          userId:       session?.id       ?? null,
          enterpriseId: session?.enterpriseId ?? null,
        }),
      });
      const json = await res.json();
      setRound((v) => v + 1);

      // 即时刷新 credits 显示（无需重新请求）
      if (json.ok && json.credits > 0) {
        if (session?.id) updateUserCredits(session.id, json.credits);
        if (task) updateTask({
          ...task,
          credits: {
            ...task.credits,
            consumed: (task.credits?.consumed ?? 0) + json.credits,
          },
        });
      }

      // 服务端返回错误：将错误信息展示在聊天框中
      if (!json.ok) {
        const errText = resolveAiError(json.message);
        setMessages((p) => [
          ...p,
          { role: "ai", text: errText, candidates: [], selectedId: null },
        ]);
        return;
      }

      const filePrefix = sentFiles.length ? "分析你上传的文件，" : "";

      // 组装 AI 消息
      let aiMsg;
      if (activeStep === "image_plan") {
        aiMsg = {
          role: "ai", type: "image_plan",
          text: `已${filePrefix}为「${currentStep.label}」生成以下切图与配图方案，请从每个区域选择你满意的方案：`,
          imageSections: json.imageSections ?? [],
        };
      } else if (activeStep === "layout") {
        const candidates = json.candidates ?? [];
        aiMsg = {
          role: "ai", type: "layout",
          text: `已${filePrefix}为「${currentStep.label}」生成以下 ${candidates.length} 套排版方案，可在下方预览效果并选择：`,
          candidates,
          selectedId: candidates[0]?.candidateId ?? null,
        };
      } else {
        const candidates    = json.candidates ?? [];
        const directionNames = candidates.map((c) => c.title || c.candidateId).join("、");
        aiMsg = {
          role: "ai",
          text: candidates.length > 0
            ? `已${filePrefix}为「${currentStep.label}」生成以下 ${candidates.length} 个候选方案，分别是：${directionNames}。请从下方选择你想深入发展的方向：`
            : `已${filePrefix}为「${currentStep.label}」生成候选方案，请查看下方结果。`,
          candidates,
          selectedId: candidates[0]?.candidateId ?? null,
        };
      }

      // finalMsgs 同时传给 setMessages 和 autoSave，
      // 避免 stateRef 异步更新导致 DB 保存的是旧消息
      const finalMsgs = [...msgsWithUser, aiMsg];
      setMessages(finalMsgs);
      autoSave({ messagesOverride: finalMsgs });
    } catch {
      setMessages((p) => [
        ...p,
        { role: "ai", text: "AI 生成失败，请稍后重试。", candidates: [], selectedId: null },
      ]);
    } finally {
      setGenerating(false);
    }
  }

  // Candidate selection（普通步骤）
  function handleSelectCandidate(msgIdx, candidateId) {
    setMessages((p) =>
      p.map((m, i) => (i === msgIdx ? { ...m, selectedId: candidateId } : m))
    );
    autoSave({ selectedCandidateId: candidateId });
  }

  // Candidate selection（image_plan 步骤，按分组更新）
  function handleSelectImageCandidate(msgIdx, sectionId, candidateId) {
    setMessages((p) =>
      p.map((m, i) => {
        if (i !== msgIdx || m.type !== "image_plan") return m;
        return {
          ...m,
          imageSections: m.imageSections.map((s) =>
            s.sectionId === sectionId ? { ...s, selectedId: candidateId } : s
          ),
        };
      })
    );
    autoSave();
  }

  // Section data update（image_plan 步骤，用于 footer 上传等）
  function handleUpdateImageSection(msgIdx, sectionId, updates) {
    setMessages((p) =>
      p.map((m, i) => {
        if (i !== msgIdx || m.type !== "image_plan") return m;
        return {
          ...m,
          imageSections: m.imageSections.map((s) =>
            s.sectionId === sectionId ? { ...s, ...updates } : s
          ),
        };
      })
    );
    autoSave();
  }

  // 进入步骤 2/3/4 且该步骤无历史消息时，自动注入上一步结果并触发首轮生成
  useEffect(() => {
    if (!task) return;
    if (selectedStepIndex === 0) return;                          // 步骤一不自动触发
    if (!task.steps?.[activeStep]?.prevSelected) return;          // 没有上一步结果
    if (autoTriggeredStepsRef.current.has(activeStep)) return;    // 本次会话已触发过

    // 优先检查内存缓存，再看 DB，避免"消息加载前误触发"
    const existing =
      stepMessagesRef.current[activeStep] ??
      task.steps?.[activeStep]?.messages ??
      [];
    if (existing.length > 0) return;                              // 已有历史消息

    autoTriggeredStepsRef.current.add(activeStep);
    const result = buildAutoPrompt(activeStep, task.steps[activeStep].prevSelected);
    if (result) runGenerate(result.apiPrompt, result.displayText);
  }, [activeStep, task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 从素材库选择文件，直接追加 attachments（文本步骤额外 fetch 文件内容）
  async function handleMaterialConfirm(selectedAttachments) {
    setShowMaterialPicker(false);
    const textStep = activeStep === "topic" || activeStep === "copywriting";
    const enriched = await Promise.all(
      selectedAttachments.map(async (a) => {
        if (textStep && a.fileUrl && isTextFileMime(a.mimeType, a.name)) {
          try {
            const text = await fetch(a.fileUrl).then((r) => r.text());
            return { ...a, textContent: text };
          } catch {
            return a;
          }
        }
        return a;
      })
    );
    setAttachments((prev) => {
      const existingIds = new Set(prev.map((a) => a.fileItemId).filter(Boolean));
      const toAdd = enriched.filter((a) => !existingIds.has(a.fileItemId));
      return [...prev, ...toAdd];
    });
  }

  // 完成创作：状态改为 completed，返回项目列表
  async function handleComplete() {
    await autoSave({ status: "completed" });
    router.push("/creator");
  }

  // Cleanup
  useEffect(
    () => () => {
      clearTimeout(saveTimerRef.current);
      clearTimeout(titleDebounceRef.current);
    },
    []
  );

  // Loading while creating
  if (creating) {
    return (
      <section className="page">
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            color: "var(--text-hint)",
          }}
        >
          <Loader2 size={18} className="spin" /> 正在创建项目…
        </div>
      </section>
    );
  }

  if (!task) return null;

  // Interactive tasks use a dedicated workspace
  if (task.taskType === "interactive") {
    return <InteractiveWorkspace />;
  }

  return (
    <section className="page">
      <div className="creator-shell">
        {/* Back bar */}
        <div className="creator-back-bar">
          <button className="creator-back-btn" onClick={() => router.push("/creator")}>
            <ArrowLeft size={13} /> 返回项目列表
          </button>
          <input
            className="creator-title-input"
            value={titleDraft}
            onChange={handleTitleChange}
            aria-label="项目名称"
          />
          <span className="creator-step-crumb">
            · {selectedStepIndex + 1}/{STEPS.length} {currentStep.label}
          </span>
          <div className="creator-bar-right">
            <SaveIndicator
              status={saveStatus}
              lastSavedAt={lastSavedAt}
              error={saveError}
            />
            <span className="creator-task-meta">公众号四步创作</span>
          </div>
        </div>

        {/* Step bar */}
        <div className="step-bar">
          {STEPS.map((s, i) => {
            const isActive  = activeStep === s.key;
            const isDone    = i < maxReachedStepIndex && !isActive;
            const isLocked  = i > maxReachedStepIndex;
            return (
              <div key={s.key} style={{ display: "flex", alignItems: "center" }}>
                <button
                  className={`step-item ${isActive ? "active" : ""} ${isDone ? "done" : ""} ${isLocked ? "locked" : ""}`}
                  onClick={() => !isLocked && handleStepChange(s.key)}
                  disabled={isLocked}
                >
                  <span className="step-num">
                    {isDone ? <CheckCircle2 size={12} /> : i + 1}
                  </span>
                  <span className="step-label">{s.label}</span>
                </button>
                {i < STEPS.length - 1 && <span className="step-connector" />}
              </div>
            );
          })}
          <span className="step-credits">
            本轮已消耗 {task.credits?.consumed || 0} credits
          </span>
        </div>

        {/* Step content */}
        <div className="step-content">
          {/* Chat */}
          <div className="step-chat">
            {messages.length === 0 && (
              <div className="chat-empty-hint">
                在下方描述品牌信息与需求，点击「发送」开始 AI 创作。
              </div>
            )}
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div className="msg user" key={i}>
                  <div className="msg-avatar">我</div>
                  <div className="msg-content">
                    {m.attachments?.length > 0 && (
                      <div className="msg-attachments">
                        {m.attachments.map((f, j) => (
                          f.mimeType?.startsWith("image/") && f.fileUrl ? (
                            <img key={j} src={f.fileUrl} alt={f.name}
                              style={{ maxWidth: 200, borderRadius: 6, display: "block", marginBottom: 4 }} />
                          ) : (
                            <div className="msg-attachment-chip" key={j}>
                              <Paperclip size={10} />
                              {f.name}
                              {f.size ? <span className="msg-attachment-size">{fmtSize(f.size)}</span> : null}
                            </div>
                          )
                        ))}
                      </div>
                    )}
                    {m.contextLabel && (
                      <div className="msg-context-chip">基于：{m.contextLabel}</div>
                    )}
                    <div className="msg-bubble">{m.text}</div>
                  </div>
                </div>
              ) : m.type === "image_plan" ? (
                // 步骤三：分组切图方案
                <ImagePlanMessage
                  key={i}
                  text={m.text}
                  imageSections={m.imageSections || []}
                  onSelect={(sectionId, candidateId) =>
                    handleSelectImageCandidate(i, sectionId, candidateId)
                  }
                  onUpdateSection={(sectionId, updates) =>
                    handleUpdateImageSection(i, sectionId, updates)
                  }
                  onRegenerate={() => runGenerate("请重新生成所有配图方案")}
                  locked={i !== lastAiCandidatesIdx}
                  session={session}
                />
              ) : m.type === "layout" ? (
                // 步骤四：排版 HTML 预览
                <LayoutPreviewMessage
                  key={i}
                  text={m.text}
                  candidates={m.candidates || []}
                  selectedId={m.selectedId}
                  onSelect={(cid) => handleSelectCandidate(i, cid)}
                  locked={i !== lastAiCandidatesIdx}
                />
              ) : (
                // 仅最后一条含候选项的 AI 消息可交互
                <AiMessage
                  key={i}
                  text={m.text}
                  candidates={m.candidates || []}
                  selectedId={m.selectedId}
                  onSelect={(cid) => handleSelectCandidate(i, cid)}
                  locked={i !== lastAiCandidatesIdx}
                />
              )
            )}
            <div ref={chatEndRef} />
            {generating && (
              <div className="msg ai">
                <div className="msg-avatar">AI</div>
                <div className="msg-content">
                  <div className="msg-bubble ai-typing">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="step-input-area">
            {/* 归档项目：普通用户只读 */}
            {isArchived && !canAdmin ? (
              <div className="past-step-notice">
                <span className="past-step-notice-text">
                  该项目已归档，仅供查看。
                </span>
              </div>
            ) : isViewingPastStep ? (
              <div className="past-step-notice">
                <span className="past-step-notice-text">
                  此步骤已完成，当前为只读查看模式。
                </span>
                <button
                  className="past-step-reset-btn"
                  onClick={() => setResetConfirmStep(activeStep)}
                >
                  从此步骤重新开始
                </button>
              </div>
            ) : (
            <>
            {attachments.length > 0 && (
              <div className="upload-preview-area">
                {attachments.map((f, i) => (
                  <div className="upload-preview-item" key={f.fileItemId || f.tempId || i}>
                    {/* 图片：用服务端 fileUrl 预览 */}
                    {f.mimeType?.startsWith("image/") && f.fileUrl ? (
                      <img className="upload-preview-thumb" src={f.fileUrl} alt={f.name} />
                    ) : (
                      <div className="upload-preview-file-icon">
                        {f.uploading
                          ? <Loader2 size={14} className="spin" />
                          : <Paperclip size={15} />}
                      </div>
                    )}
                    <div className="upload-preview-info">
                      <div className="upload-preview-name">{f.name}</div>
                      <div className="upload-preview-size">
                        {f.uploading ? "上传中…" : fmtSize(f.size)}
                      </div>
                    </div>
                    {!f.uploading && (
                      <button
                        className="upload-preview-remove"
                        onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))}
                        aria-label="移除文件"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {activeStep !== "image_plan" && (
              <>
                <div className="upload-toolbar">
                  <button className="upload-btn" onClick={() => fileInputRef.current?.click()}>
                    <Upload size={13} />
                    {isTextStep ? "上传文本文件" : "上传文件/图片"}
                    {isTextStep
                      ? <span className="upload-btn-hint">支持 txt / md / csv / json 等</span>
                      : <span className="upload-btn-hint">支持 JPG/PNG/PDF/DOC 等</span>}
                  </button>
                  <button className="upload-btn" onClick={() => setShowMaterialPicker(true)}>
                    <FolderOpen size={13} /> 从素材库选择
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={
                    isTextStep
                      ? ".txt,.md,.csv,.json,.jsonl,.xml,.yaml,.yml,.log"
                      : "image/*,.svg,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt"
                  }
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                />
              </>
            )}

            <div className="step-input-wrapper">
              <textarea
                className="chat-input"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    runGenerate();
                  }
                }}
                placeholder={currentStep.placeholder}
                rows={2}
              />
              <button
                className="send-btn"
                onClick={() => runGenerate()}
                disabled={!prompt.trim() || generating}
              >
                发送 <Send size={14} />
              </button>
            </div>

            <div className="step-actions">
              {selectedStepIndex > 0 && (
                <button
                  className="step-back-btn"
                  onClick={() => handleStepChange(STEPS[selectedStepIndex - 1].key)}
                >
                  上一步
                </button>
              )}
              {selectedStepIndex < STEPS.length - 1 ? (
                <button
                  className="step-next-btn"
                  disabled={!hasAiResponse}
                  title={!hasAiResponse ? "请先与 AI 对话并生成内容" : undefined}
                  onClick={() => handleStepChange(STEPS[selectedStepIndex + 1].key)}
                >
                  确认{currentStep.label}，下一步 <ChevronRight size={13} />
                </button>
              ) : (
                <button
                  className="step-next-btn"
                  disabled={!hasAiResponse}
                  onClick={handleComplete}
                >
                  完成创作 <CheckCircle2 size={13} />
                </button>
              )}
            </div>
            </> /* end non-past-step branch */
            )}
          </div>
        </div>
      </div>

      {/* 重新开始确认弹窗 */}
      {resetConfirmStep && (() => {
        const resetIdx  = stepIndex(resetConfirmStep);
        const resetLabel = STEPS[resetIdx]?.label ?? "";
        const clearLabels = STEPS.slice(resetIdx + 1).map((s) => s.label).join("、");
        return (
          <div className="modal-overlay" onClick={() => setResetConfirmStep(null)}>
            <div className="reset-confirm-box" onClick={(e) => e.stopPropagation()}>
              <div className="reset-confirm-title">从「{resetLabel}」重新开始？</div>
              {clearLabels && (
                <div className="reset-confirm-body">
                  这将清除「{clearLabels}」的所有内容，操作不可撤销。
                </div>
              )}
              <div className="reset-confirm-actions">
                <button className="btn btn-ghost" onClick={() => setResetConfirmStep(null)}>取消</button>
                <button className="btn btn-danger" onClick={() => handleResetFromStep(resetConfirmStep)}>
                  确认重新开始
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 素材库选择弹窗 */}
      {showMaterialPicker && (
        <MaterialPickerModal
          session={session}
          onConfirm={handleMaterialConfirm}
          onClose={() => setShowMaterialPicker(false)}
          textOnly={isTextStep}
        />
      )}
    </section>
  );
}
