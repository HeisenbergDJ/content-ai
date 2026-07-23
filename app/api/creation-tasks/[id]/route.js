import { ObjectId } from "mongodb";
import { getDb, normalizeDoc } from "@/lib/mongodb";
import { STEPS, stepIndex } from "@/lib/helpers";

export async function PATCH(req, { params }) {
  if (!ObjectId.isValid(params.id)) {
    return Response.json({ ok: false, message: "Invalid task id" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const $set   = { updatedAt: new Date() };
  const $unset = {};

  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (!title) {
      return Response.json({ ok: false, message: "项目名称不能为空" }, { status: 400 });
    }
    $set.title = title;
  }

  if (typeof body.currentStep === "string") {
    $set.currentStep = body.currentStep;
  }

  if (typeof body.currentStepIndex === "number") {
    $set.currentStepIndex = body.currentStepIndex;
  }

  // 记录用户曾到达过的最远步骤（只增不减，由前端在前进时携带）
  if (typeof body.maxReachedStepIndex === "number") {
    $set.maxReachedStepIndex = body.maxReachedStepIndex;
  }

  if (["draft", "in_progress", "completed", "archived"].includes(body.status)) {
    $set.status = body.status;
  }

  if (typeof body.selectedCandidateId === "string" && typeof body.currentStep === "string") {
    $set[`steps.${body.currentStep}.selectedCandidateId`] = body.selectedCandidateId;
  }

  // 持久化某个步骤的完整对话记录
  if (
    body.stepMessages &&
    typeof body.stepMessages.step === "string" &&
    Array.isArray(body.stepMessages.messages)
  ) {
    $set[`steps.${body.stepMessages.step}.messages`] = body.stepMessages.messages;
  }

  // 持久化上一步骤确认的候选项到下一步骤的 prevSelected
  if (
    body.prevSelected &&
    typeof body.prevSelected.step === "string" &&
    body.prevSelected.candidate &&
    typeof body.prevSelected.candidate === "object"
  ) {
    $set[`steps.${body.prevSelected.step}.prevSelected`] = body.prevSelected.candidate;
  }

  // 交互式图文：更新交互类型
  if (typeof body.interactionType === "string") {
    $set.interactionType = body.interactionType;
  }

  // 交互式图文：更新已上传参考图列表
  if (Array.isArray(body.inputImages)) {
    $set.inputImages = body.inputImages;
  }

  // 从指定步骤重新开始：清除该步骤之后所有步骤的数据
  if (typeof body.resetFromStep === "string") {
    const resetIdx = stepIndex(body.resetFromStep);
    $set.currentStep          = body.resetFromStep;
    $set.currentStepIndex     = resetIdx + 1;
    $set.maxReachedStepIndex  = resetIdx;
    // 清除该步骤的 prevSelected（避免自动触发上一轮旧结果）
    $unset[`steps.${body.resetFromStep}.prevSelected`] = "";
    // 清除之后所有步骤的全部数据
    for (let i = resetIdx + 1; i < STEPS.length; i++) {
      $unset[`steps.${STEPS[i].key}`] = "";
    }
  }

  // 交互式图文：追加一轮生成记录到 generations 数组
  const $push = {};
  if (body.pushGeneration && typeof body.pushGeneration === "object") {
    $push.generations = body.pushGeneration;
  }

  const update = { $set };
  if (Object.keys($unset).length > 0) update.$unset = $unset;
  if (Object.keys($push).length > 0) update.$push = $push;

  const db = await getDb();
  const result = await db.collection("creation_tasks").findOneAndUpdate(
    { _id: new ObjectId(params.id) },
    update,
    { returnDocument: "after" },
  );

  if (!result) {
    return Response.json({ ok: false, message: "Task not found" }, { status: 404 });
  }

  return Response.json({ ok: true, task: normalizeDoc(result) });
}

export async function DELETE(req, { params }) {
  if (!ObjectId.isValid(params.id)) {
    return Response.json({ ok: false, message: "Invalid task id" }, { status: 400 });
  }
  const db = await getDb();
  const result = await db.collection("creation_tasks").deleteOne({ _id: new ObjectId(params.id) });
  if (result.deletedCount === 0) {
    return Response.json({ ok: false, message: "Task not found" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
