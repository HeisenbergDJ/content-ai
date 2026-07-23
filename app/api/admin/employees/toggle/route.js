import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";

export async function PATCH(req) {
  const body = await req.json().catch(() => ({}));
  const { userId } = body;
  if (!userId) return Response.json({ ok: false, message: "userId required" }, { status: 400 });

  const db = await getDb();
  const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });
  if (!user) return Response.json({ ok: false, message: "User not found" }, { status: 404 });

  const nextStatus = user.status === "active" ? "disabled" : "active";
  await db.collection("users").updateOne(
    { _id: user._id },
    {
      $set: {
        status: nextStatus,
        updatedAt: new Date(),
        "seat.lastDisabledAt": nextStatus === "disabled" ? new Date() : user.seat?.lastDisabledAt || null,
        "seat.lastEnabledAt": nextStatus === "active" ? new Date() : user.seat?.lastEnabledAt || null,
      },
    }
  );

  return Response.json({ ok: true, status: nextStatus });
}


