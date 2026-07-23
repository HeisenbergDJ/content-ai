import { ObjectId } from "mongodb";

/**
 * 根据模型 type、定价和 token 用量计算 credits 消耗。
 * @param {string} type           - 模型类型（text-reasoning / text-chat / image-t2i 等）
 * @param {object} pricing        - model_configs.pricing
 * @param {object} usage          - AI 接口返回的 usage 对象
 * @param {number} creditsPerRmb  - 换算系数（platform_config.creditsPerRmb）
 * @returns {{ credits: number, costRmb: number }}
 */
export function calcCredits(type, pricing, usage, creditsPerRmb) {
  let costRmb = 0;

  if (type === "text-reasoning" || type === "text-chat") {
    const reasoningTokens =
      usage.reasoning_tokens ??
      usage.completion_tokens_details?.reasoning_tokens ??
      0;
    costRmb =
      ((usage.prompt_tokens     ?? 0) / 1_000_000) * pricing.input +
      ((usage.completion_tokens ?? 0) / 1_000_000) * pricing.output +
      (reasoningTokens           / 1_000_000) * (pricing.reasoning ?? pricing.output);
  }
  // image / video 类型在对应能力函数实现时补充

  return {
    credits: Math.ceil(costRmb * creditsPerRmb),
    costRmb: +costRmb.toFixed(6),
  };
}

/**
 * 扣减 credits，依次写入四个地方：
 *   1. creation_tasks.credits.breakdown（任务级明细）
 *   2. users.credits（员工余额）
 *   3. tenants.credits（企业余额，subscription 优先，不足再扣 topups）
 *   4. credit_usage_records（企业审计流水）
 *
 * @param {Db}     db
 * @param {object} params
 * @param {ObjectId} params.userId
 * @param {ObjectId} params.enterpriseId
 * @param {ObjectId|null} params.taskId
 * @param {string}   params.step
 * @param {string}   params.modelId
 * @param {string}   params.type
 * @param {number}   params.credits
 * @param {number}   params.costRmb
 * @param {object}   params.usage
 */
export async function deductCredits(db, {
  userId, enterpriseId, taskId,
  step, modelId, type,
  credits, costRmb, usage,
}) {
  if (credits <= 0) return;

  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const reasoningTokens =
    usage.reasoning_tokens ??
    usage.completion_tokens_details?.reasoning_tokens ??
    0;

  // 1. 任务明细
  if (taskId) {
    await db.collection("creation_tasks").updateOne(
      { _id: taskId instanceof ObjectId ? taskId : new ObjectId(taskId) },
      {
        $inc:  { "credits.consumed": credits },
        $push: {
          "credits.breakdown": {
            step,
            model:            modelId,
            type,
            promptTokens:     usage.prompt_tokens     ?? 0,
            completionTokens: usage.completion_tokens ?? 0,
            reasoningTokens,
            costRmb,
            credits,
            at: now.toISOString(),
          },
        },
      }
    );
  }

  // 2. 员工余额
  await db.collection("users").updateOne(
    { _id: userId instanceof ObjectId ? userId : new ObjectId(userId) },
    { $inc: { "credits.used": credits, "credits.remaining": -credits } }
  );

  // 3. 企业余额：subscription 优先，不足再扣 topups（按到期时间从近到远）
  const tenantId = enterpriseId instanceof ObjectId ? enterpriseId : new ObjectId(enterpriseId);
  const tenant   = await db.collection("tenants").findOne({ _id: tenantId });
  const sub      = tenant?.credits?.subscription;
  const topups   = (tenant?.credits?.topups ?? [])
    .filter(t => t.remaining > 0 && new Date(t.expiresAt) > now)
    .sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt));

  let left = credits;

  if (sub && sub.remaining > 0) {
    const fromSub = Math.min(sub.remaining, left);
    await db.collection("tenants").updateOne(
      { _id: tenantId },
      { $inc: { "credits.subscription.consumed": fromSub, "credits.subscription.remaining": -fromSub } }
    );
    left -= fromSub;
  }

  for (const topup of topups) {
    if (left <= 0) break;
    const fromTopup = Math.min(topup.remaining, left);
    await db.collection("tenants").updateOne(
      { _id: tenantId, "credits.topups.id": topup.id },
      { $inc: { "credits.topups.$.consumed": fromTopup, "credits.topups.$.remaining": -fromTopup } }
    );
    left -= fromTopup;
  }

  // 4. 审计流水
  await db.collection("credit_usage_records").insertOne({
    enterpriseId: tenantId,
    userId:       userId instanceof ObjectId ? userId : new ObjectId(userId),
    period,
    type:         "consume",
    amount:       -credits,
    context: {
      taskId:    taskId ? (taskId instanceof ObjectId ? taskId : new ObjectId(taskId)) : null,
      taskType:  "wechat",
      stepName:  step,
      modelId,
      modelType: type,
      costRmb,
      usage: {
        promptTokens:     usage.prompt_tokens     ?? 0,
        completionTokens: usage.completion_tokens ?? 0,
        reasoningTokens,
      },
    },
    createdAt: now,
  });
}
