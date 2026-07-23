import { ObjectId } from "mongodb";
import { getDb, normalizeDoc } from "@/lib/mongodb";

// DELETE /api/file-items/:id  — 删除素材（仅管理员）
export async function DELETE(req, { params }) {
  if (!ObjectId.isValid(params.id)) {
    return Response.json({ ok: false, message: "Invalid id" }, { status: 400 });
  }
  try {
    const db = await getDb();
    await db.collection("file_items").deleteOne({ _id: new ObjectId(params.id) });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: false, message: err.message }, { status: 500 });
  }
}

// PATCH /api/file-items/:id  — 更新素材元数据（目前支持 category）
export async function PATCH(req, { params }) {
  if (!ObjectId.isValid(params.id)) {
    return Response.json({ ok: false, message: "Invalid id" }, { status: 400 });
  }
  try {
    const body  = await req.json().catch(() => ({}));
    const $set  = { updatedAt: new Date() };
    if (typeof body.category === "string") $set.category = body.category;
    if (typeof body.name     === "string") $set.name     = body.name.trim();

    const db     = await getDb();
    const result = await db.collection("file_items").findOneAndUpdate(
      { _id: new ObjectId(params.id) },
      { $set },
      { returnDocument: "after" }
    );
    if (!result) return Response.json({ ok: false, message: "Not found" }, { status: 404 });
    return Response.json({ ok: true, fileItem: normalizeDoc(result) });
  } catch (err) {
    return Response.json({ ok: false, message: err.message }, { status: 500 });
  }
}
