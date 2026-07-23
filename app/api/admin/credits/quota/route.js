import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";

export async function PATCH(req) {
  const body = await req.json().catch(() => ({}));
  const { userId, quota } = body;

  if (!userId || typeof quota !== "number" || quota < 0) {
    return Response.json({ ok: false, message: "Invalid payload" }, { status: 400 });
  }

  const db = await getDb();
  const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });
  if (!user) return Response.json({ ok: false, message: "User not found" }, { status: 404 });

  const used = user.credits?.used || 0;
  if (quota < used) {
    return Response.json({ ok: false, message: "quota cannot be less than used" }, { status: 400 });
  }

  await db.collection("users").updateOne(
    { _id: user._id },
    {
      $set: {
        "credits.quota": quota,
        "credits.remaining": quota - used,
        updatedAt: new Date(),
      },
    }
  );

  return Response.json({ ok: true });
}


