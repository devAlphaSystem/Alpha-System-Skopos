import crypto from "node:crypto";
import logger from "./logger.js";

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
 * Encrypts a plaintext string using AES-256-GCM with per-operation key derivation.
 *
 * A fresh 32-byte salt and 16-byte IV are generated for every call, then a
 * 32-byte key is derived via PBKDF2 (SHA-256, 100 000 iterations) from the master
 * key (`ENCRYPTION_KEY` env var) + salt. The output is:
 * `base64(salt[32] || iv[16] || authTag[16] || ciphertext)`
 *
 * @param {string} text - Plaintext to encrypt.
 * @returns {string} Base64-encoded encrypted blob.
 * @throws {Error} If `ENCRYPTION_KEY` is missing or invalid, or encryption fails.
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
 * Decrypts a base64-encoded blob produced by `encrypt()`.
 *
 * Extracts the salt, IV, and auth tag from the blob, re-derives the key via PBKDF2,
 * and decrypts using AES-256-GCM. The auth tag is verified before returning plaintext;
 * any tampering causes an AuthenticationError.
 *
 * @param {string} encryptedData - Base64-encoded blob from `encrypt()`.
 * @returns {string} Decrypted plaintext.
 * @throws {Error} If decryption fails due to tampering, wrong key, or malformed input.
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
