/**
 * AI 客户端工厂
 * 从 model_configs 集合读取模型配置，解密 API Key，返回 SDK 客户端实例。
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI    from "openai";
import { getDb }        from "@/lib/mongodb";
import { decryptSecret } from "@/lib/crypto";

/**
 * 从数据库按 type 查找当前启用的模型配置，返回解密后的客户端所需信息。
 * 每种 type 同一时刻只允许一个 enabled: true 的记录。
 * @param {string} type  - model_configs 中的 type 字段（如 "text-reasoning"、"image-t2i"）
 * @returns {{ client: OpenAI|Anthropic, modelId: string, provider: string, type: string, pricing: object }}
 */
export async function getModelConfig(type) {
  const db  = await getDb();
  const cfg = await db.collection("model_configs").findOne({ type, enabled: true });

  if (!cfg) {
    throw new Error(`未找到类型 [${type}] 的启用模型，请在管理后台 model_configs 中确认。`);
  }
  if (!cfg.encryptedApiKey) {
    throw new Error(`模型 [${cfg.modelId}] 的 API Key 尚未配置，请通过管理后台加密写入。`);
  }

  const apiKey = decryptSecret(cfg.encryptedApiKey);

  let client;
  if (cfg.provider === "anthropic") {
    client = new Anthropic({ apiKey });
  } else {
    // OpenAI-compatible（openai / deepseek / 其他兼容厂商）
    client = new OpenAI({ apiKey, baseURL: cfg.baseURL });
  }

  return {
    client,
    modelId:  cfg.modelId,
    provider: cfg.provider,
    type:     cfg.type,
    pricing:  cfg.pricing,
  };
}

/**
 * @deprecated 旧接口，保留供其他模块过渡期使用，后续统一改用 getModelConfig。
 */
export async function getTenantAiConfig() {
  const db     = await getDb();
  const tenant = await db.collection("tenants").findOne({}, { sort: { updatedAt: -1 } });
  const cfg    = tenant?.apiConfig;
  if (!cfg?.encryptedKey) {
    throw new Error("企业尚未配置 API Key，请在管理后台「模型配置」中填写后再使用 AI 功能。");
  }
  return {
    provider: cfg.provider || "anthropic",
    model:    cfg.model    || "claude-sonnet-4-6",
    apiKey:   decryptSecret(cfg.encryptedKey),
  };
}

/** @deprecated 旧接口，保留供过渡期使用。 */
export async function getAiClient() {
  const { provider, model, apiKey } = await getTenantAiConfig();
  let client;
  if (provider === "anthropic") {
    client = new Anthropic({ apiKey });
  } else if (provider === "openai") {
    client = new OpenAI({ apiKey });
  } else if (provider === "deepseek") {
    client = new OpenAI({ apiKey, baseURL: "https://api.deepseek.com" });
  } else {
    throw new Error(`不支持的服务商：${provider}`);
  }
  return { client, provider, model };
}
