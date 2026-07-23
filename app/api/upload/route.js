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

// POST /api/upload  — 资料库手动上传文件，在 library_items 建记录
export async function POST(req) {
  try {
    const formData = await req.formData().catch(() => null);
    if (!formData) {
      return Response.json({ ok: false, message: "Invalid form data" }, { status: 400 });
    }

    const file         = formData.get("file");
    const enterpriseId = formData.get("enterpriseId");
    const userId       = formData.get("userId");
    const userName     = formData.get("userName") || "";
    const category     = formData.get("category") || "other";

    if (!file || !enterpriseId || !userId) {
      return Response.json({ ok: false, message: "file / enterpriseId / userId are required" }, { status: 400 });
    }

    let entObjId, userObjId;
    try { entObjId  = new ObjectId(enterpriseId); } catch { return Response.json({ ok: false, message: "Invalid enterpriseId" }, { status: 400 }); }
    try { userObjId = new ObjectId(userId);       } catch { return Response.json({ ok: false, message: "Invalid userId"       }, { status: 400 }); }

    const uploadDir = resolveUploadDir();
    await mkdir(uploadDir, { recursive: true });

    const ext      = extname(file.name) || "";
    const filename = `up_${Date.now()}_${Math.random().toString(36).slice(2, 7)}${ext}`;
    await writeFile(join(uploadDir, filename), Buffer.from(await file.arrayBuffer()));

    const fileUrl = buildFileUrl(filename);

    const now = new Date();
    const db  = await getDb();
    const doc = {
      type:         "file",
      name:         file.name,
      category,
      enterpriseId: entObjId,
      storage: {
        url:  fileUrl,
        key:  filename,
        mime: file.type || "application/octet-stream",
        size: file.size,
      },
      uploader:  { userId: userObjId, name: userName },
      source:    null,
      permission: { level: "private" },
      review:    { status: "pending" },
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection("library_items").insertOne(doc);
    const item   = await db.collection("library_items").findOne({ _id: result.insertedId });
    return Response.json({ ok: true, item: normalizeDoc(item) }, { status: 201 });

  } catch (err) {
    console.error("[upload POST]", err);
    return Response.json({ ok: false, message: err.message || "Upload failed" }, { status: 500 });
  }
}
