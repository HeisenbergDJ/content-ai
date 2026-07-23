import { ObjectId } from "mongodb";
import { getDb, normalizeDoc } from "@/lib/mongodb";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const { userId, userName, enterpriseId, title, type, taskType } = body;

  if (!userId || !enterpriseId) {
    return Response.json({ ok: false, message: "userId and enterpriseId are required" }, { status: 400 });
  }

  let userObjId;
  try { userObjId = new ObjectId(userId); } catch {
    return Response.json({ ok: false, message: "Invalid userId" }, { status: 400 });
  }

  let entObjId;
  try { entObjId = new ObjectId(enterpriseId); } catch {
    return Response.json({ ok: false, message: "Invalid enterpriseId" }, { status: 400 });
  }

  const db = await getDb();

  const user = await db.collection("users").findOne({ _id: userObjId });
  if (!user || user.status !== "active") {
    return Response.json({ ok: false, message: "User not found or inactive" }, { status: 403 });
  }

  // 自动计数：未命名项目_1、未命名项目_2 …
  const count = await db.collection("creation_tasks").countDocuments({ enterpriseId: entObjId });
  const defaultTitle = `未命名项目_${count + 1}`;

  const now = new Date();
  const resolvedTaskType = taskType || "wechat";
  const isInteractive = resolvedTaskType === "interactive";

  const doc = {
    enterpriseId: entObjId,
    userId: userObjId,
    userName: userName || user.name || "",
    title: title || defaultTitle,
    type: type || "wechat",
    taskType: resolvedTaskType,
    status: "draft",
    credits: { consumed: 0, breakdown: [] },
    createdAt: now,
    updatedAt: now,
    ...(isInteractive
      ? { inputImages: [], generations: [], interactionType: "hotspot" }
      : { currentStep: "topic", currentStepIndex: 1, steps: {} }),
  };

  const result = await db.collection("creation_tasks").insertOne(doc);
  const task   = await db.collection("creation_tasks").findOne({ _id: result.insertedId });

  return Response.json({ ok: true, task: normalizeDoc(task) }, { status: 201 });
}
