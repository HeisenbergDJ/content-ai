import { getDb, normalizeDoc } from "@/lib/mongodb";
import { encryptSecret, maskSecret, isEncrypted } from "@/lib/crypto";

// ── 工具：取当前唯一租户 ────────────────────────────────────────────────────
async function getTenant(db) {
  return db.collection("tenants").findOne({}, { sort: { updatedAt: -1 } });
}

/**
 * GET /api/admin/api-config
 * 返回当前租户的 API 配置（Key 脱敏，不返回密文）
 */
export async function GET() {
  try {
    const db     = await getDb();
    const tenant = await getTenant(db);
    if (!tenant) {
      return Response.json({ ok: false, message: "租户不存在" }, { status: 404 });
    }

    const cfg = tenant.apiConfig || {};
    return Response.json({
      ok: true,
      apiConfig: {
        provider:  cfg.provider  || "",
        model:     cfg.model     || "",
        // Key 只返回脱敏版，原始密文绝不出接口
        maskedKey: cfg.encryptedKey ? maskSecret(cfg.encryptedKey) : "",
        hasKey:    Boolean(cfg.encryptedKey),
      },
    });
  } catch (err) {
    console.error("[api-config GET]", err);
    return Response.json({ ok: false, message: err.message }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/api-config
 * 保存或更新 API Key（存储前加密）
 * Body: { provider, model, apiKey }
 *   - apiKey 传空字符串 = 删除 Key
 *   - apiKey 不传 / undefined = 只更新 provider/model，不动 Key
 */
export async function PATCH(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const { provider, model, apiKey } = body;

    const db     = await getDb();
    const tenant = await getTenant(db);
    if (!tenant) {
      return Response.json({ ok: false, message: "租户不存在" }, { status: 404 });
    }

    const $set = { updatedAt: new Date() };

    if (provider !== undefined) $set["apiConfig.provider"] = provider;
    if (model    !== undefined) $set["apiConfig.model"]    = model;

    if (apiKey === "") {
      // 空字符串 = 删除 Key
      $set["apiConfig.encryptedKey"] = null;
    } else if (typeof apiKey === "string" && apiKey.length > 0) {
      // 有值 = 加密后保存（避免重复加密已加密的内容）
      $set["apiConfig.encryptedKey"] = isEncrypted(apiKey)
        ? apiKey
        : encryptSecret(apiKey);
    }

    await db.collection("tenants").updateOne(
      { _id: tenant._id },
      { $set }
    );

    // 返回脱敏后的最新配置
    const updated = await getTenant(db);
    const cfg     = updated.apiConfig || {};
    return Response.json({
      ok: true,
      apiConfig: {
        provider:  cfg.provider  || "",
        model:     cfg.model     || "",
        maskedKey: cfg.encryptedKey ? maskSecret(cfg.encryptedKey) : "",
        hasKey:    Boolean(cfg.encryptedKey),
      },
    });
  } catch (err) {
    console.error("[api-config PATCH]", err);
    return Response.json({ ok: false, message: err.message }, { status: 500 });
  }
}
