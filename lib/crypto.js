/**
 * API Key 加密工具
 *
 * 环境变量要求：
 *   ENCRYPTION_KEY=<64位十六进制字符串>  (= 32 字节 AES-256 密钥)
 *
 * 生成命令：node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

import crypto from "crypto";

const ALG = "aes-256-gcm";

function getKey() {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "环境变量 ENCRYPTION_KEY 未设置或格式错误（需要 64 位十六进制字符串）"
    );
  }
  return Buffer.from(hex, "hex");
}

/**
 * 加密明文字符串，返回可安全存入数据库的字符串
 * 格式：<iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
export function encryptSecret(plaintext) {
  const key = getKey();
  const iv  = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * 解密 encryptSecret 存储的字符串，返回原始明文
 */
export function decryptSecret(stored) {
  const key = getKey();
  const [ivHex, tagHex, encHex] = stored.split(":");
  if (!ivHex || !tagHex || !encHex) throw new Error("密文格式错误");
  const decipher = crypto.createDecipheriv(ALG, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return (
    decipher.update(Buffer.from(encHex, "hex")).toString("utf8") +
    decipher.final("utf8")
  );
}

/**
 * 返回脱敏展示字符串，用于前端展示，永不暴露完整 Key
 * 示例：sk-ant-api03-••••••••3f9a
 */
export function maskSecret(stored) {
  try {
    const plain = decryptSecret(stored);
    if (plain.length <= 8) return "••••••••";
    return plain.slice(0, 10) + "••••••••" + plain.slice(-4);
  } catch {
    return "••••••••";
  }
}

/**
 * 判断一个字符串是否是 encryptSecret 产生的密文（而非明文）
 */
export function isEncrypted(value) {
  return typeof value === "string" && value.split(":").length === 3;
}
