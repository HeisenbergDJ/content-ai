/**
 * seed-model-config.mjs
 *
 * 初始化以下两张表：
 *   - platform_config  : 平台全局配置（credits 换算系数等）
 *   - model_configs    : AI 模型配置（定价、API Key 等）
 *
 * 运行方式：
 *   node scripts/seed-model-config.mjs
 *
 * 环境变量（可选，不传则使用默认值）：
 *   MONGODB_URI=mongodb://127.0.0.1:27017
 *   MONGODB_DB=contentai
 *
 * ── 关于 API Key ──────────────────────────────────────────────────────────────
 * 脚本写入 encryptedApiKey: null（占位）。
 * 申请到各厂商 API Key 后，通过管理后台「模型配置」页面加密写入。
 * 写入完成并验证可用后，即可删除 .env.local 中对应的明文 Key 及相关查询逻辑。
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const MONGODB_DB  = process.env.MONGODB_DB  || "contentai";

// ─────────────────────────────────────────────────────────────────────────────
// 1. 平台全局配置
// ─────────────────────────────────────────────────────────────────────────────
const PLATFORM_CONFIG = {
  _id: "credits_config",

  /**
   * creditsPerRmb：AI 成本换算系数
   *
   * 含义：消耗 ¥1 的真实 AI 接口费用，对应扣减多少 credits。
   * 当前设定：100  →  1 credit = ¥0.01 的真实 AI 成本
   *
   * ⚠️  此系数【仅用于成本核算】，不控制平台利润。
   *     平台利润 = 企业购买 credits 的售价  -  真实 AI 成本折算的 credits 价值
   *     售价由超级管理员在给企业分配 credits 时单独设定。
   */
  creditsPerRmb: 100,

  updatedAt: new Date(),
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. 模型配置表
//
// 所有价格单位：人民币（¥）
// 计费单位说明：
//   - 文本模型：¥ / 百万 tokens（M tokens）
//   - 图像模型：¥ / 张（按分辨率区分）
//   - 视频模型：¥ / 秒
//
// type 枚举（每种 type 同一时刻只允许一个 enabled: true）：
//   text-reasoning  深度思考文本（含 reasoning tokens）
//   text-chat       标准对话文本
//   image-t2i       文生图 text-to-image
//   image-i2i       图生图 image-to-image
//   video-t2v       文生视频 text-to-video
//   video-i2v       图生视频 image-to-video
//   video-v2v       视频生视频 video-to-video
//
// ⚠️  以下 pricing 均为近似参考值，正式上线前请前往各厂商官网核对：
//     DeepSeek → platform.deepseek.com（API 定价页）
//     fal.ai   → fal.ai（Pricing 页）
//     Kling    → klingai.com（开放平台 → 定价）
//     核对完成后同步更新 pricing 字段和 pricingUpdatedAt。
// ─────────────────────────────────────────────────────────────────────────────
const MODEL_CONFIGS = [

  // ── text-reasoning：深度思考文本 ────────────────────────────────────────

  {
    modelId:          "deepseek-v4-pro",
    provider:         "deepseek",
    type:             "text-reasoning",
    label:            "DeepSeek V4 Pro（深度思考）",
    baseURL:          "https://api.deepseek.com",
    enabled:          true,

    encryptedApiKey:  null,  // 通过管理后台加密写入

    pricingUpdatedAt: "2026-06-28",
    // 单位：¥ / 百万 tokens
    pricing: {
      input:     4.00,   // ⚠️ 近似值，请核对官网
      output:    16.00,  // ⚠️ 近似值，请核对官网
      reasoning: 16.00,  // thinking 模型专属（思考链 tokens）⚠️ 近似值
    },

    createdAt: new Date(),
    updatedAt: new Date(),
  },

  // ── text-chat：标准对话文本 ──────────────────────────────────────────────

  {
    modelId:          "deepseek-chat",
    provider:         "deepseek",
    type:             "text-chat",
    label:            "DeepSeek Chat（标准对话）",
    baseURL:          "https://api.deepseek.com",
    enabled:          true,

    encryptedApiKey:  null,  // 与 deepseek-v4-pro 共用同一个 DeepSeek API Key

    pricingUpdatedAt: "2026-06-28",
    // 单位：¥ / 百万 tokens
    pricing: {
      input:  0.50,  // ⚠️ 近似值，请核对官网
      output: 2.00,  // ⚠️ 近似值，请核对官网
    },

    createdAt: new Date(),
    updatedAt: new Date(),
  },

  // ── image-t2i：文生图 text-to-image ─────────────────────────────────────

  {
    modelId:          "flux-1-pro",
    provider:         "fal",
    type:             "image-t2i",
    label:            "Flux 1 Pro（文生图）",
    baseURL:          "https://fal.run",
    enabled:          false,  // 预留，上线后改为 true 并填入 encryptedApiKey

    encryptedApiKey:  null,

    pricingUpdatedAt: "2026-06-28",
    // 单位：¥ / 张
    pricing: {
      "1024x1024": 0.36,  // ⚠️ 近似值，请核对官网
      "2048x2048": 0.72,  // ⚠️ 近似值，请核对官网
    },

    createdAt: new Date(),
    updatedAt: new Date(),
  },

  // ── image-i2i：图生图 image-to-image ─────────────────────────────────────

  {
    modelId:          "flux-fill-pro",
    provider:         "fal",
    type:             "image-i2i",
    label:            "Flux Fill Pro（图生图 / 局部重绘）",
    baseURL:          "https://fal.run",
    enabled:          false,  // 预留，上线后改为 true 并填入 encryptedApiKey

    encryptedApiKey:  null,

    pricingUpdatedAt: "2026-06-28",
    // 单位：¥ / 张
    pricing: {
      "1024x1024": 0.36,  // ⚠️ 近似值，请核对官网
    },

    createdAt: new Date(),
    updatedAt: new Date(),
  },

  // ── video-t2v：文生视频 text-to-video ───────────────────────────────────

  {
    modelId:          "kling-v2-t2v",
    provider:         "kling",
    type:             "video-t2v",
    label:            "快手 Kling V2（文生视频）",
    baseURL:          "https://api.klingai.com",
    enabled:          false,  // 预留，上线后改为 true 并填入 encryptedApiKey

    encryptedApiKey:  null,

    pricingUpdatedAt: "2026-06-28",
    // 单位：¥ / 秒
    pricing: {
      perSecond: 1.00,  // ⚠️ 近似值，请核对官网
    },

    createdAt: new Date(),
    updatedAt: new Date(),
  },

  // ── video-i2v：图生视频 image-to-video ──────────────────────────────────

  {
    modelId:          "kling-v2-i2v",
    provider:         "kling",
    type:             "video-i2v",
    label:            "快手 Kling V2（图生视频）",
    baseURL:          "https://api.klingai.com",
    enabled:          false,  // 预留，上线后改为 true 并填入 encryptedApiKey

    encryptedApiKey:  null,

    pricingUpdatedAt: "2026-06-28",
    // 单位：¥ / 秒
    pricing: {
      perSecond: 1.00,  // ⚠️ 近似值，请核对官网
    },

    createdAt: new Date(),
    updatedAt: new Date(),
  },

  // ── video-v2v：视频生视频 video-to-video ────────────────────────────────

  {
    modelId:          "kling-v2-v2v",
    provider:         "kling",
    type:             "video-v2v",
    label:            "快手 Kling V2（视频生视频）",
    baseURL:          "https://api.klingai.com",
    enabled:          false,  // 预留，上线后改为 true 并填入 encryptedApiKey

    encryptedApiKey:  null,

    pricingUpdatedAt: "2026-06-28",
    // 单位：¥ / 秒
    pricing: {
      perSecond: 1.00,  // ⚠️ 近似值，请核对官网
    },

    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 执行写入（upsert，重复运行安全）
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db(MONGODB_DB);

    // platform_config
    const platformCol = db.collection("platform_config");
    await platformCol.updateOne(
      { _id: "credits_config" },
      { $set: PLATFORM_CONFIG },
      { upsert: true }
    );
    console.log("✅ platform_config → credits_config 写入完成");

    // model_configs
    const modelCol = db.collection("model_configs");
    for (const cfg of MODEL_CONFIGS) {
      await modelCol.updateOne(
        { modelId: cfg.modelId },
        { $set: cfg },
        { upsert: true }
      );
      console.log(`✅ model_configs → [${cfg.modelId}] 写入完成`);
    }

    console.log("\n🎉 所有配置写入完成。");
    console.log("📋 后续步骤：");
    console.log("   1. 前往各厂商官网核对价格，更新 pricing 字段和 pricingUpdatedAt");
    console.log("   2. 申请各厂商 API Key，通过管理后台加密写入 encryptedApiKey");
    console.log("   3. 验证 AI 调用正常后，删除 .env.local 中对应的明文 Key");

  } catch (err) {
    console.error("❌ 写入失败：", err);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
