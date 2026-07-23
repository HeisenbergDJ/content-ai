import { ObjectId } from "mongodb";
import { getDb, normalizeDoc } from "@/lib/mongodb";

// PATCH /api/library-items/:id  — 更新审核状态 / 权限
export async function PATCH(req, { params }) {
  if (!ObjectId.isValid(params.id)) {
    return Response.json({ ok: false, message: "Invalid id" }, { status: 400 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const $set = { updatedAt: new Date() };

    if (body.reviewStatus) $set["review.status"] = body.reviewStatus;
    if (body.reviewNote)   $set["review.note"]   = body.reviewNote;
    if (body.permission)   $set.permission        = body.permission;

    const db     = await getDb();
    const result = await db.collection("library_items").findOneAndUpdate(
      { _id: new ObjectId(params.id) },
      { $set },
      { returnDocument: "after" }
    );
    if (!result) return Response.json({ ok: false, message: "Not found" }, { status: 404 });
    return Response.json({ ok: true, item: normalizeDoc(result) });
  } catch (err) {
    return Response.json({ ok: false, message: err.message }, { status: 500 });
  }
}
