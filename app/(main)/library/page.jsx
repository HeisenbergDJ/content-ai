"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown, ChevronLeft, ChevronRight,
  Download, Eye, FileText, FolderPlus,
  Image, Loader2, MoreHorizontal, Plus,
  Presentation, Search, Tag, Trash2, Upload, X,
} from "lucide-react";
import { useApp } from "@/lib/AppContext";

// 产出库分类（library_items）
const OUTPUT_CATEGORIES = [
  { key: "all",    label: "全部" },
  { key: "wechat", label: "公众号图文", color: "#4F46E5" },
  { key: "poster", label: "海报设计",   color: "#DB2777" },
  { key: "ppt",    label: "PPT演示",    color: "#D97706" },
];

const CATEGORY_LABEL = {
  wechat: "公众号图文", poster: "海报设计",
  ppt: "PPT演示", other: "其他",
};

function fmtSize(b = 0) {
  if (!b) return "-";
  return b < 1024 ? `${b}B`
    : b < 1_048_576 ? `${(b / 1024).toFixed(1)}KB`
    : `${(b / 1_048_576).toFixed(1)}MB`;
}

function fmtDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ── 产出库 ────────────────────────────────────────────────────────────────────
function OutputLibrary({ data, session, loadBootstrap }) {
  const library = (data?.library || []).filter((f) => f.review?.status === "approved");
  const [activeCategory, setActiveCategory] = useState("all");
  const [showUpload,   setShowUpload]   = useState(false);
  const [uploading,    setUploading]    = useState(false);
  const [uploadCat,    setUploadCat]    = useState("wechat");
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);

  const filtered = activeCategory === "all"
    ? library
    : library.filter((f) => f.category === activeCategory);

  function handleFileSelect(e) {
    const f = e.target.files?.[0];
    if (f) {
      if (uploadCat === "wechat" && !f.name.toLowerCase().endsWith(".txt")) {
        alert("公众号图文产出资料仅支持 .txt 文件");
        e.target.value = "";
        return;
      }
      setSelectedFile(f);
    }
    e.target.value = "";
  }

  async function handleUpload() {
    if (!selectedFile) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file",         selectedFile);
      form.append("enterpriseId", session?.enterpriseId || "");
      form.append("userId",       session?.id           || "");
      form.append("userName",     session?.name         || "");
      form.append("category",     uploadCat);
      const res  = await fetch("/api/upload", { method: "POST", body: form });
      const json = await res.json();
      if (json.ok) { setShowUpload(false); setSelectedFile(null); loadBootstrap(); }
      else alert("上传失败：" + (json.message || ""));
    } catch (e) { alert("上传出错：" + e.message); }
    finally { setUploading(false); }
  }

  return (
    <>
      <div className="task-toolbar" style={{ marginBottom: 16 }}>
        <div className="search-wrapper">
          <Search size={14} />
          <input className="search-input" placeholder="搜索产出库..." />
        </div>
        <button className="btn btn-primary" onClick={() => setShowUpload(true)}>
          <Upload size={13} /> 上传资料
        </button>
      </div>

      {/* 分类筛选 */}
      <div className="lib-filter-tabs">
        {OUTPUT_CATEGORIES.map((c) => (
          <button
            key={c.key}
            className={`lib-filter-tab ${activeCategory === c.key ? "active" : ""}`}
            onClick={() => setActiveCategory(c.key)}
          >
            {c.label}
            <span className="lib-filter-count">
              {c.key === "all" ? library.length : library.filter((f) => f.category === c.key).length}
            </span>
          </button>
        ))}
      </div>

      <table className="data-table">
        <thead>
          <tr><th>名称</th><th>类型</th><th>上传者</th><th>权限</th><th>审核</th><th>操作</th></tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--text-hint)", padding: "32px 0" }}>暂无产出</td></tr>
          ) : filtered.map((f) => (
            <tr key={f.id}>
              <td><strong>{f.name}</strong></td>
              <td>{CATEGORY_LABEL[f.category] || f.category || "-"}</td>
              <td>{f.uploader?.name || "-"}</td>
              <td><span className={`tag perm-${f.permission?.level || "private"}`}>
                {{ public: "公开", department: "团队", private: "私有" }[f.permission?.level] || "-"}
              </span></td>
              <td>{{ approved: "已审核", pending: "待审核", rejected: "已拒绝" }[f.review?.status] || "-"}</td>
              <td>
                {(f.storage?.url || f.fileUrl) ? (
                  <a href={f.storage?.url || f.fileUrl} download={f.name} className="btn btn-sm">
                    <Download size={12} /> 下载
                  </a>
                ) : <button className="btn btn-sm" disabled>无文件</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 上传弹窗 */}
      {showUpload && (
        <div className="modal-overlay" onClick={() => !uploading && setShowUpload(false)}>
          <div className="modal-box" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h3 className="modal-title" style={{ margin: 0 }}>上传产出资料</h3>
              <button onClick={() => setShowUpload(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={18} /></button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>文件分类</div>
              <div style={{ display: "flex", gap: 8 }}>
                {OUTPUT_CATEGORIES.filter((c) => c.key !== "all").map((c) => (
                  <button key={c.key} onClick={() => { setUploadCat(c.key); setSelectedFile(null); }}
                    style={{ padding: "5px 12px", borderRadius: 6, fontSize: 12, border: "1.5px solid",
                      borderColor: uploadCat === c.key ? (c.color || "var(--primary)") : "var(--border)",
                      background: uploadCat === c.key ? (c.color || "var(--primary)") + "18" : "transparent",
                      color: uploadCat === c.key ? (c.color || "var(--primary)") : "var(--text-secondary)",
                      cursor: "pointer" }}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="upload-drop-zone" onClick={() => fileInputRef.current?.click()}>
              {selectedFile ? (
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 550, color: "#111827", marginBottom: 4 }}>{selectedFile.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{fmtSize(selectedFile.size)}</div>
                </div>
              ) : (
                <div style={{ textAlign: "center", color: "var(--text-secondary)" }}>
                  <Upload size={28} style={{ marginBottom: 8, opacity: 0.5 }} />
                  <div style={{ fontSize: 13 }}>点击选择文件</div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>
                    {uploadCat === "wechat" ? "仅支持 .txt 文件" : "支持 JPG/PNG/PDF/DOC/PPT 等"}
                  </div>
                </div>
              )}
            </div>
            <input ref={fileInputRef} type="file" style={{ display: "none" }} accept={uploadCat === "wechat" ? ".txt" : undefined} onChange={handleFileSelect} />
            <div className="modal-actions" style={{ marginTop: 20 }}>
              <button className="btn btn-ghost" onClick={() => setShowUpload(false)} disabled={uploading}>取消</button>
              <button className="btn btn-primary" onClick={handleUpload} disabled={!selectedFile || uploading}>
                {uploading ? <><Loader2 size={13} className="spin" /> 上传中…</> : "确认上传"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── 素材文件卡片 ──────────────────────────────────────────────────────────────
function MaterialFileCard({ file, allCategories, onCategoryChange, isAdmin, onDelete, onPreview }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const isImage = file.mimeType?.startsWith("image/");
  const catLabel = file.category || "未分类";
  const hasUrl   = Boolean(file.fileUrl);

  useEffect(() => {
    if (!menuOpen) return;
    function handler(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  function handleThumbClick() {
    if (!hasUrl) return;
    if (isImage) {
      onPreview(file);
    } else {
      const a = document.createElement("a");
      a.href = file.fileUrl;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }

  return (
    <div className="mat-card">
      <div
        className={`mat-card-thumb${hasUrl ? " mat-thumb-clickable" : ""}`}
        onClick={handleThumbClick}
      >
        {isImage && hasUrl ? (
          <>
            <img src={file.fileUrl} alt={file.name} />
            <div className="mat-thumb-overlay">
              <Eye size={18} />
              <span>查看</span>
            </div>
          </>
        ) : (
          <>
            <div className="mat-card-icon">
              <FileText size={26} />
              <span>{(file.fileType || "file").toUpperCase()}</span>
            </div>
            {hasUrl && (
              <div className="mat-thumb-overlay">
                <Download size={18} />
                <span>下载</span>
              </div>
            )}
          </>
        )}
      </div>
      <div className="mat-card-body">
        <div className="mat-card-name" title={file.name}>{file.name}</div>
        <div className="mat-card-meta">{fmtSize(file.size)}</div>

        {isAdmin ? (
          /* 管理员：分类下拉 + 删除 */
          <div className="mat-card-actions">
            <div className="mat-cat-wrap" ref={menuRef} style={{ flex: 1, minWidth: 0 }}>
              <button
                className="mat-cat-btn"
                onClick={() => setMenuOpen((v) => !v)}
                title="修改分类"
              >
                <Tag size={9} />
                {catLabel}
                <ChevronDown size={9} />
              </button>
              {menuOpen && (
                <div className="mat-cat-dropdown">
                  <button
                    className={`mat-cat-opt ${!file.category ? "active" : ""}`}
                    onClick={() => { onCategoryChange(""); setMenuOpen(false); }}
                  >
                    未分类
                  </button>
                  {allCategories.map((cat) => (
                    <button
                      key={cat}
                      className={`mat-cat-opt ${file.category === cat ? "active" : ""}`}
                      onClick={() => { onCategoryChange(cat); setMenuOpen(false); }}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="mat-card-del-btn" onClick={onDelete} title="删除素材">
              <Trash2 size={11} />
            </button>
          </div>
        ) : (
          /* 普通用户：只读分类标签 */
          <div className="mat-cat-readonly">
            <Tag size={9} />
            {catLabel}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 素材库 ────────────────────────────────────────────────────────────────────
function MaterialLibrary({ session, isAdmin }) {
  const [fileItems,        setFileItems]        = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [uploading,        setUploading]        = useState(false);
  const [isDragging,       setIsDragging]       = useState(false);
  const [selectedCat,      setSelectedCat]      = useState("__all__");
  const [extraCats,        setExtraCats]        = useState([]); // 用户新建但暂无文件的分类
  const [showNewCatModal,  setShowNewCatModal]  = useState(false);
  const [newCatName,       setNewCatName]       = useState("");
  const [searchQ,          setSearchQ]          = useState("");
  const [lightboxFile,     setLightboxFile]     = useState(null);
  const fileInputRef = useRef(null);
  const dropRef      = useRef(null);

  // 加载素材列表
  async function loadItems() {
    if (!session?.enterpriseId) { setLoading(false); return; }
    try {
      const res  = await fetch(`/api/file-items?enterpriseId=${session.enterpriseId}`);
      const json = await res.json();
      if (json.ok) setFileItems(json.fileItems || []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { loadItems(); }, [session?.enterpriseId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 派生分类列表（文件中已有的 + 用户手动新建的）
  const allCategories = useMemo(() => {
    const fromItems = [...new Set(fileItems.map((f) => f.category).filter(Boolean))];
    const merged    = [...new Set([...fromItems, ...extraCats])].sort();
    return merged;
  }, [fileItems, extraCats]);

  // 当前分类下的文件
  const filteredItems = useMemo(() => {
    let items =
      selectedCat === "__all__"          ? fileItems
      : selectedCat === "__uncategorized__" ? fileItems.filter((f) => !f.category)
      : fileItems.filter((f) => f.category === selectedCat);
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      items = items.filter((f) => f.name.toLowerCase().includes(q));
    }
    return items;
  }, [fileItems, selectedCat, searchQ]);

  // 当前视图下可预览的图片列表（用于 lightbox 前/后翻页）
  const imageItems  = useMemo(
    () => filteredItems.filter((f) => f.mimeType?.startsWith("image/") && f.fileUrl),
    [filteredItems]
  );
  const lightboxIdx = lightboxFile
    ? imageItems.findIndex((f) => f.id === lightboxFile.id)
    : -1;

  // 键盘导航：Esc 关闭，← / → 切换
  useEffect(() => {
    if (!lightboxFile) return;
    function onKey(e) {
      if (e.key === "Escape") { setLightboxFile(null); return; }
      if (e.key === "ArrowLeft"  && lightboxIdx > 0)
        setLightboxFile(imageItems[lightboxIdx - 1]);
      if (e.key === "ArrowRight" && lightboxIdx < imageItems.length - 1)
        setLightboxFile(imageItems[lightboxIdx + 1]);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [lightboxFile, lightboxIdx, imageItems]); // eslint-disable-line react-hooks/exhaustive-deps

  // 上传文件
  async function uploadFiles(files) {
    if (!files?.length || uploading) return;
    setUploading(true);
    const category = selectedCat === "__all__" || selectedCat === "__uncategorized__"
      ? "" : selectedCat;
    const newItems = [];
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file",         file);
      form.append("userId",       session?.id           || "");
      form.append("userName",     session?.name         || "");
      form.append("enterpriseId", session?.enterpriseId || "");
      form.append("category",     category);
      try {
        const res  = await fetch("/api/file-items", { method: "POST", body: form });
        const json = await res.json();
        if (json.ok && json.fileItem) newItems.push(json.fileItem);
      } catch {}
    }
    if (newItems.length) setFileItems((prev) => [...newItems, ...prev]);
    setUploading(false);
  }

  // 拖拽事件
  function onDragOver(e)  { e.preventDefault(); setIsDragging(true); }
  function onDragLeave(e) { if (!dropRef.current?.contains(e.relatedTarget)) setIsDragging(false); }
  function onDrop(e)      { e.preventDefault(); setIsDragging(false); uploadFiles(e.dataTransfer.files); }

  // 删除素材（管理员专用）
  async function handleDelete(itemId, itemName) {
    if (!confirm(`确定要删除素材「${itemName}」吗？此操作不可撤销。`)) return;
    const res  = await fetch(`/api/file-items/${itemId}`, { method: "DELETE" });
    const json = await res.json();
    if (json.ok) {
      setFileItems((prev) => prev.filter((f) => f.id !== itemId));
    } else {
      alert("删除失败：" + (json.message || "未知错误"));
    }
  }

  // 修改分类
  async function handleCategoryChange(itemId, newCat) {
    const res  = await fetch(`/api/file-items/${itemId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: newCat }),
    });
    const json = await res.json();
    if (json.ok) {
      setFileItems((prev) =>
        prev.map((f) => f.id === itemId ? { ...f, category: newCat } : f)
      );
    }
  }

  // 新建分类
  function handleCreateCat() {
    const name = newCatName.trim();
    if (!name) return;
    if (!allCategories.includes(name)) setExtraCats((prev) => [...prev, name]);
    setSelectedCat(name);
    setNewCatName("");
    setShowNewCatModal(false);
  }

  return (
    <div className="mat-layout">
      {/* ── 左侧分类面板 ── */}
      <div className="mat-sidebar">
        <div className="mat-sidebar-hd">
          <span>分类</span>
          <button className="mat-new-cat-btn" onClick={() => setShowNewCatModal(true)} title="新建分类">
            <FolderPlus size={14} />
          </button>
        </div>

        <div className="mat-cat-list">
          {[
            { key: "__all__",           label: "全部素材",   count: fileItems.length },
            { key: "__uncategorized__", label: "未分类",     count: fileItems.filter((f) => !f.category).length },
          ].map(({ key, label, count }) => (
            <button
              key={key}
              className={`mat-cat-item ${selectedCat === key ? "active" : ""}`}
              onClick={() => setSelectedCat(key)}
            >
              <span>{label}</span>
              <span className="mat-cat-count">{count}</span>
            </button>
          ))}
          {allCategories.length > 0 && <div className="mat-cat-divider" />}
          {allCategories.map((cat) => (
            <button
              key={cat}
              className={`mat-cat-item ${selectedCat === cat ? "active" : ""}`}
              onClick={() => setSelectedCat(cat)}
            >
              <span>{cat}</span>
              <span className="mat-cat-count">
                {fileItems.filter((f) => f.category === cat).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── 右侧内容区 ── */}
      <div className="mat-content">
        {/* 搜索栏 */}
        <div className="task-toolbar" style={{ marginBottom: 14 }}>
          <div className="search-wrapper">
            <Search size={14} />
            <input
              className="search-input"
              placeholder="搜索素材名称…"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
            />
          </div>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {filteredItems.length} 个素材
          </span>
        </div>

        {/* 拖拽上传区 */}
        <div
          ref={dropRef}
          className={`mat-dropzone ${isDragging ? "dragging" : ""} ${uploading ? "uploading" : ""}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
        >
          {uploading ? (
            <><Loader2 size={15} className="spin" style={{ marginRight: 6 }} /> 上传中，请稍候…</>
          ) : isDragging ? (
            <><Upload size={15} style={{ marginRight: 6 }} /> 松开鼠标即可上传</>
          ) : (
            <>
              <Upload size={15} style={{ marginRight: 6, opacity: 0.5 }} />
              拖拽文件到此处，或
              <span style={{ color: "var(--primary)", marginLeft: 4, textDecoration: "underline", cursor: "pointer" }}>
                点击上传
              </span>
            </>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={(e) => { uploadFiles(e.target.files); e.target.value = ""; }}
        />

        {/* 文件网格 */}
        {loading ? (
          <div className="mat-placeholder">
            <Loader2 size={18} className="spin" /> 加载素材库…
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="mat-placeholder">
            {searchQ ? "未找到匹配的素材" : "当前分类暂无素材，上传或拖拽文件即可添加"}
          </div>
        ) : (
          <div className="mat-grid">
            {filteredItems.map((f) => (
              <MaterialFileCard
                key={f.id}
                file={f}
                allCategories={allCategories}
                onCategoryChange={(newCat) => handleCategoryChange(f.id, newCat)}
                isAdmin={isAdmin}
                onDelete={() => handleDelete(f.id, f.name)}
                onPreview={setLightboxFile}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── 新建分类弹窗 ── */}
      {showNewCatModal && (
        <div className="modal-overlay" onClick={() => setShowNewCatModal(false)}>
          <div className="modal-box" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">新建素材分类</h3>
            <p className="modal-desc" style={{ marginBottom: 16 }}>
              输入分类名称，之后可将素材拖入或通过卡片菜单归入该分类。
            </p>
            <input
              style={{
                width: "100%", boxSizing: "border-box", border: "1.5px solid var(--border)",
                borderRadius: 8, padding: "8px 12px", fontSize: 13.5, outline: "none",
              }}
              placeholder="如：品牌素材、产品图片…"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateCat()}
              autoFocus
            />
            <div className="modal-actions" style={{ marginTop: 20 }}>
              <button className="btn btn-ghost" onClick={() => setShowNewCatModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleCreateCat} disabled={!newCatName.trim()}>
                创建分类
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 图片灯箱 ── */}
      {lightboxFile && (
        <div className="lightbox-overlay" onClick={() => setLightboxFile(null)}>
          {/* 关闭 */}
          <button className="lightbox-close" onClick={() => setLightboxFile(null)}>
            <X size={18} />
          </button>

          {/* 上一张 */}
          {lightboxIdx > 0 && (
            <button
              className="lightbox-nav lightbox-prev"
              onClick={(e) => { e.stopPropagation(); setLightboxFile(imageItems[lightboxIdx - 1]); }}
            >
              <ChevronLeft size={22} />
            </button>
          )}

          {/* 图片主体 */}
          <div className="lightbox-img-wrap" onClick={(e) => e.stopPropagation()}>
            <img src={lightboxFile.fileUrl} alt={lightboxFile.name} className="lightbox-img" />
          </div>

          {/* 下一张 */}
          {lightboxIdx < imageItems.length - 1 && (
            <button
              className="lightbox-nav lightbox-next"
              onClick={(e) => { e.stopPropagation(); setLightboxFile(imageItems[lightboxIdx + 1]); }}
            >
              <ChevronRight size={22} />
            </button>
          )}

          {/* 底栏：文件信息 + 下载 */}
          <div className="lightbox-footer" onClick={(e) => e.stopPropagation()}>
            <span className="lightbox-name">{lightboxFile.name}</span>
            <span className="lightbox-meta">{fmtSize(lightboxFile.size)}</span>
            {imageItems.length > 1 && (
              <span className="lightbox-counter">
                {lightboxIdx + 1} / {imageItems.length}
              </span>
            )}
            <a
              href={lightboxFile.fileUrl}
              download={lightboxFile.name}
              className="btn btn-sm lightbox-dl-btn"
              onClick={(e) => e.stopPropagation()}
            >
              <Download size={12} /> 下载
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 资源中心主页面 ──────────────────────────────────────────────────────────
export default function ResourceCenterPage() {
  const { data, session, loadBootstrap } = useApp();
  const [activeTab, setActiveTab] = useState("output");

  const users    = data?.users || [];
  const me       = users.find((u) => u.id === session?.id) || session;
  const isAdmin  = me?.role === "tenant_admin" || me?.role === "super_admin";

  return (
    <section className="page">
      <div className="content">
        {/* 标签卡 */}
        <div className="resource-tabs">
          <button
            className={`resource-tab ${activeTab === "output" ? "active" : ""}`}
            onClick={() => setActiveTab("output")}
          >
            产出库
          </button>
          <button
            className={`resource-tab ${activeTab === "material" ? "active" : ""}`}
            onClick={() => setActiveTab("material")}
          >
            素材库
          </button>
        </div>

        {activeTab === "output"
          ? <OutputLibrary data={data} session={session} loadBootstrap={loadBootstrap} />
          : <MaterialLibrary session={session} isAdmin={isAdmin} />
        }
      </div>
    </section>
  );
}
