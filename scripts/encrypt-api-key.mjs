/**
 * encrypt-api-key.mjs
 *
 * 将明文 API Key 用 ENCRYPTION_KEY 加密，输出可直接写入 MongoDB 的密文。
 *
 * 运行方式：
 *   node scripts/encrypt-api-key.mjs <明文ApiKey>
 *
 * 示例：
 *   node scripts/encrypt-api-key.mjs sk-xxxxxxxxxxxxxxxx
 *
 * ENCRYPTION_KEY 读取优先级：
 *   1. 当前目录的 .env.local 文件
 *   2. 系统环境变量 ENCRYPTION_KEY
 *
 * ✅ 完全离线运行，无任何网络请求，无外部依赖，仅使用 Node.js 内置模块。
 * ✅ 加密算法与系统 lib/crypto.js 完全一致（AES-256-GCM）。
 * ✅ 输出的密文格式：<iv_hex>:<authTag_hex>:<ciphertext_hex>
 */

import crypto   from "crypto";
import fs       from "fs";
import path     from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── 读取 .env.local ────────────────────────────────────────────────────────
function loadEnvLocal() {
  // 脚本在 scripts/ 目录，.env.local 在上一级（web/）
  const envPath = path.resolve(__dirname, "../.env.local");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    // 只写入未被系统环境变量覆盖的 key
    if (!process.env[key]) process.env[key] = val;
  }
}

// ── AES-256-GCM 加密（与 lib/crypto.js 完全一致）─────────────────────────
function encryptSecret(plaintext) {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY 未找到或格式错误（需要 64 位十六进制字符串）\n" +
      "请确认 .env.local 中已正确设置 ENCRYPTION_KEY"
    );
  }

  const key     = Buffer.from(hex, "hex");
  const iv      = crypto.randomBytes(16);
  const cipher  = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

// ── 主流程 ─────────────────────────────────────────────────────────────────
loadEnvLocal();

const plainApiKey = process.argv[2];

if (!plainApiKey) {
  console.error("❌ 请提供明文 API Key 作为参数");
  console.error("   用法：node scripts/encrypt-api-key.mjs <明文ApiKey>");
  process.exit(1);
}

try {
  const encrypted = encryptSecret(plainApiKey);

  console.log("\n✅ 加密成功\n");
  console.log("─── 密文（复制以下内容写入 MongoDB）───────────────────────");
  console.log(encrypted);
  console.log("────────────────────────────────────────────────────────────\n");
  console.log("写入示例（MongoDB Shell）：");
  console.log(`db.model_configs.updateOne(`);
  console.log(`  { modelId: "your-model-id" },`);
  console.log(`  { $set: { encryptedApiKey: "${encrypted}", updatedAt: new Date() } }`);
  console.log(`)\n`);
} catch (err) {
  console.error("❌ 加密失败：", err.message);
  process.exit(1);
}
