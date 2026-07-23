import { ObjectId } from "mongodb";
import { getDb, normalizeDoc } from "@/lib/mongodb";
import { writeFile, mkdir } from "fs/promises";
import { join, extname, isAbsolute, relative } from "path";

function resolveUploadDir() {
  const dir = process.env.UPLOAD_DIR;
  if (!dir) return join(process.cwd(), "public", "uploads");
  return isAbsolute(dir) ? dir : join(process.cwd(), dir);
}

function buildFileUrl(filename) {
  const uploadDir = resolveUploadDir();
  const publicDir = join(process.cwd(), "public");
  if (uploadDir.startsWith(publicDir)) {
    const rel = relative(publicDir, join(uploadDir, filename)).replace(/\\/g, "/");
    return `/${rel}`;
  }
  return `/api/files/${filename}`;
}

/**
 * GET /api/file-items?enterpriseId=xxx
 * 返回企业的素材库文件列表
 */
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const enterpriseId = searchParams.get("enterpriseId");
    if (!enterpriseId) {
      return Response.json({ ok: false, message: "enterpriseId required" }, { status: 400 });
    }
    const { ObjectId: ObjId } = await import("mongodb");
    let entObjId;
    try { entObjId = new ObjId(enterpriseId); } catch { return Response.json({ ok: false, message: "Invalid enterpriseId" }, { status: 400 }); }

    const db = await getDb();
    const items = await db.collection("file_items")
      .find({ enterpriseId: entObjId })
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();

    return Response.json({ ok: true, fileItems: normalizeDoc(items) });
  } catch (err) {
    console.error("[file-items GET]", err);
    return Response.json({ ok: false, message: err.message }, { status: 500 });
  }
}

/**
 * POST /api/file-items
 * 接收 multipart/form-data，保存文件到 UPLOAD_DIR，在 file_items collection 建记录
 * file_items = 创作过程中的附件；library_items = 最终归档发布的内容
 */
export async function POST(req) {
  try {
    const formData = await req.formData().catch(() => null);
    if (!formData) {
      return Response.json({ ok: false, message: "Invalid form data" }, { status: 400 });
    }

    const file         = formData.get("file");
    const userId       = formData.get("userId")       || "";
    const userName     = formData.get("userName")     || "";
    const enterpriseId = formData.get("enterpriseId") || "";
    const category     = formData.get("category")     || "";

    if (!file) {
      return Response.json({ ok: false, message: "No file provided" }, { status: 400 });
    }

    // 保存文件
    const uploadDir = resolveUploadDir();
    await mkdir(uploadDir, { recursive: true });

    const ext      = extname(file.name) || "";
    const filename = `fi_${Date.now()}_${Math.random().toString(36).slice(2, 7)}${ext}`;
    const buffer   = Buffer.from(await file.arrayBuffer());
    await writeFile(join(uploadDir, filename), buffer);

    const fileUrl = buildFileUrl(filename);

    // ObjectId 解析（容错）
    let userObjId;
    try { userObjId = new ObjectId(userId); } catch { userObjId = userId; }
    let entObjId;
    try { entObjId = new ObjectId(enterpriseId); } catch { entObjId = enterpriseId || null; }

    // 写入 file_items（collection 不存在时 MongoDB 自动创建）
    const db  = await getDb();
    const now = new Date();
    const doc = {
      name:         file.name,
      filename,
      fileUrl,
      fileType:     ext.replace(".", "") || "file",
      mimeType:     file.type || "application/octet-stream",
      size:         file.size,
      category:     category || null,
      uploader:     { id: userObjId, name: userName },
      enterpriseId: entObjId,
      createdAt:    now,
    };

    const result   = await db.collection("file_items").insertOne(doc);
    const fileItem = await db.collection("file_items").findOne({ _id: result.insertedId });

    return Response.json({ ok: true, fileItem: normalizeDoc(fileItem) }, { status: 201 });
  } catch (err) {
    console.error("[file-items POST]", err);
    return Response.json({ ok: false, message: err.message || "Upload failed" }, { status: 500 });
  }
}
