import crypto from "node:crypto";
import logger from "../services/logger.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

function getEncryptionKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be a 64-character hex string (32 bytes)");
  }
  return Buffer.from(key, "hex");
}

/**
 * Encrypts sensitive data using AES-256-GCM
 * @param {string} text - Plain text to encrypt
 * @returns {string} - Base64 encoded encrypted data with IV and auth tag
 */
export function encrypt(text) {
  try {
    const masterKey = getEncryptionKey();

    const iv = crypto.randomBytes(IV_LENGTH);

    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = crypto.pbkdf2Sync(masterKey, salt, 100000, 32, "sha256");

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, "utf8");
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    const authTag = cipher.getAuthTag();

    const combined = Buffer.concat([salt, iv, authTag, encrypted]);

    return combined.toString("base64");
  } catch (error) {
    logger.error("Encryption error: %o", error);
    throw new Error("Failed to encrypt data");
  }
}

/**
 * Decrypts data encrypted with encrypt()
 * @param {string} encryptedData - Base64 encoded encrypted data
 * @returns {string} - Decrypted plain text
 */
export function decrypt(encryptedData) {
  try {
    const masterKey = getEncryptionKey();

    const combined = Buffer.from(encryptedData, "base64");

    const salt = combined.subarray(0, SALT_LENGTH);
    const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

    const key = crypto.pbkdf2Sync(masterKey, salt, 100000, 32, "sha256");

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString("utf8");
  } catch (error) {
    logger.error("Decryption error: %o", error);
    throw new Error("Failed to decrypt data");
  }
}

/**
 * Masks an API key for display (shows first/last 4 chars)
 * @param {string} key - API key to mask
 * @returns {string} - Masked key
 */
export function maskApiKey(key) {
  if (!key || key.length < 12) {
    return "••••••••";
  }
  const start = key.substring(0, 4);
  const end = key.substring(key.length - 4);
  const middle = "•".repeat(Math.max(8, key.length - 8));
  return `${start}${middle}${end}`;
}
