import { ObjectId } from "mongodb";
import { getDb, normalizeDoc } from "@/lib/mongodb";
import { writeFile, mkdir } from "fs/promises";
import { join, isAbsolute, relative } from "path";

function resolveUploadDir() {
  const dir = process.env.UPLOAD_DIR;
  if (!dir) return join(process.cwd(), "public", "uploads");
  // 相对路径 → 相对于项目根目录
  return isAbsolute(dir) ? dir : join(process.cwd(), dir);
}

/** 根据 UPLOAD_DIR 是否在 public/ 内，选择合适的 fileUrl */
function buildFileUrl(filename) {
  const uploadDir = resolveUploadDir();
  const publicDir = join(process.cwd(), "public");
  if (uploadDir.startsWith(publicDir)) {
    // 在 public/ 内 → 直接静态访问
    const rel = relative(publicDir, join(uploadDir, filename)).replace(/\\/g, "/");
    return `/${rel}`;
  }
  // 在 public/ 外 → 走文件服务 API
  return `/api/files/${filename}`;
}

// POST /api/library-items  — 归档富文本 HTML 到资料库
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const { name, category, htmlContent, enterpriseId, userId, userName, sourceTaskId } = body;

    if (!name || !userId) {
      return Response.json({ ok: false, message: "name / userId are required" }, { status: 400 });
    }

    const db = await getDb();

    // userId 解析
    let userObjId;
    try { userObjId = new ObjectId(userId); }
    catch { return Response.json({ ok: false, message: "Invalid userId" }, { status: 400 }); }

    // enterpriseId：优先用传入的，否则从 DB 查
    let entObjId;
    if (enterpriseId) {
      try { entObjId = new ObjectId(enterpriseId); }
      catch { return Response.json({ ok: false, message: "Invalid enterpriseId" }, { status: 400 }); }
    } else {
      const user = await db.collection("users").findOne({ _id: userObjId });
      if (!user?.enterpriseId) {
        return Response.json({ ok: false, message: "Enterprise not found for this user" }, { status: 400 });
      }
      entObjId = user.enterpriseId;
    }

    // 保存 HTML 文件
    const uploadDir = resolveUploadDir();
    await mkdir(uploadDir, { recursive: true });
    const filename = `wechat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.html`;
    await writeFile(join(uploadDir, filename), htmlContent || "", "utf-8");
    const fileUrl = buildFileUrl(filename);

    const now    = new Date();
    const taskObjId = sourceTaskId
      ? (() => { try { return new ObjectId(sourceTaskId); } catch { return null; } })()
      : null;

    const doc = {
      // ── 必填基础字段 ──
      type:         "file",            // file | folder（设计文档要求）
      name,
      category:     category || "wechat",
      enterpriseId: entObjId,

      // ── 存储信息（统一放 storage 子对象）──
      storage: {
        url:  fileUrl,
        key:  filename,
        mime: "text/html",
        size: (htmlContent || "").length,
      },

      // ── 上传者（索引字段为 uploader.userId）──
      uploader: { userId: userObjId, name: userName || "" },

      // ── 归档来源 ──
      source: taskObjId ? { taskId: taskObjId } : null,

      // ── 权限与审核 ──
      permission: { level: "department" },   // public | department | private
      review:     { status: "pending" },

      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection("library_items").insertOne(doc);
    const item   = await db.collection("library_items").findOne({ _id: result.insertedId });
    return Response.json({ ok: true, item: normalizeDoc(item) }, { status: 201 });

  } catch (err) {
    console.error("[library-items POST]", err);
    return Response.json({ ok: false, message: err.message || "Internal error" }, { status: 500 });
  }
}
