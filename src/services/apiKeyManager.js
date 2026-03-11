import { pbAdmin, ensureAdminAuth } from "./pocketbase.js";
import { encrypt, decrypt } from "../utils/encryption.js";
import logger from "../utils/logger.js";

/**
 * Encrypts and stores an API key for a given service. Updates the existing record if one
 * already exists with the same user + service + label combination.
 *
 * @param {string} userId - PocketBase user record ID.
 * @param {string} service - Service identifier: `'resend'`, `'google_pagespeed'`, or `'chapybara'`.
 * @param {string} apiKey - Plaintext API key to encrypt and store.
 * @param {string} [label=''] - Optional label to allow multiple keys per service.
 * @param {object} [metadata={}] - Arbitrary metadata to store alongside the key.
 * @returns {Promise<string>} The PocketBase record ID of the stored (or updated) key.
 * @throws {Error} If encryption or the PocketBase write fails.
 */
export async function storeApiKey(userId, service, apiKey, label = "", metadata = {}) {
  try {
    await ensureAdminAuth();

    const encryptedKey = encrypt(apiKey);

    const existing = await pbAdmin
      .collection("api_keys")
      .getFirstListItem(`user="${userId}" && service="${service}" && label="${label}"`, { requestKey: null })
      .catch(() => null);

    if (existing) {
      await pbAdmin.collection("api_keys").update(existing.id, {
        encryptedKey,
        metadata,
        isActive: true,
        updated: new Date().toISOString(),
      });
      logger.info("Updated API key for service: %s, user: %s", service, userId);
      return existing.id;
    }

    const record = await pbAdmin.collection("api_keys").create({
      user: userId,
      service,
      label,
      encryptedKey,
      metadata,
      isActive: true,
      usageCount: 0,
    });
    logger.info("Stored new API key for service: %s, user: %s", service, userId);
    return record.id;
  } catch (error) {
    logger.error("Error storing API key: %o", error);
    throw error;
  }
}

/**
 * Retrieves and decrypts an API key. Increments the usage counter asynchronously.
 *
 * @param {string} userId - PocketBase user record ID.
 * @param {string} service - Service identifier.
 * @param {string} [label=''] - Optional label filter.
 * @returns {Promise<string|null>} Decrypted API key, or `null` if not found.
 * @throws {Error} If decryption fails (key was stored with a different `ENCRYPTION_KEY`).
 */
export async function getApiKey(userId, service, label = "") {
  try {
    await ensureAdminAuth();

    const filter = label ? `user="${userId}" && service="${service}" && label="${label}" && isActive=true` : `user="${userId}" && service="${service}" && isActive=true`;

    const record = await pbAdmin.collection("api_keys").getFirstListItem(filter, {
      requestKey: null,
    });

    if (!record) {
      return null;
    }

    const decryptedKey = decrypt(record.encryptedKey);

    pbAdmin
      .collection("api_keys")
      .update(record.id, {
        lastUsed: new Date().toISOString(),
        usageCount: (record.usageCount || 0) + 1,
      })
      .catch((err) => logger.warn("Failed to update API key usage: %o", err));

    return decryptedKey;
  } catch (error) {
    if (error.status === 404) {
      return null;
    }
    logger.error("Error retrieving API key: %o", error);
    throw error;
  }
}

export async function listApiKeys(userId) {
  try {
    await ensureAdminAuth();

    const records = await pbAdmin.collection("api_keys").getFullList({
      filter: `user="${userId}"`,
      sort: "-created",
    });

    return records.map((record) => ({
      id: record.id,
      service: record.service,
      label: record.label,
      isActive: record.isActive,
      lastUsed: record.lastUsed,
      usageCount: record.usageCount,
      metadata: record.metadata,
      created: record.created,
      updated: record.updated,
    }));
  } catch (error) {
    logger.error("Error listing API keys: %o", error);
    throw error;
  }
}

export async function deleteApiKey(userId, keyId) {
  try {
    await ensureAdminAuth();

    const record = await pbAdmin.collection("api_keys").getOne(keyId);
    if (record.user !== userId) {
      throw new Error("Unauthorized");
    }

    await pbAdmin.collection("api_keys").delete(keyId);
    logger.info("Deleted API key %s for user %s", keyId, userId);
    return true;
  } catch (error) {
    logger.error("Error deleting API key: %o", error);
    throw error;
  }
}

/**
 * Retrieves an API key for a service, falling back to an environment variable if no
 * user-stored key exists. Used by services (e.g. seoAnalyzer) that support both a
 * per-user key and a server-wide default.
 *
 * @param {string} userId - PocketBase user record ID.
 * @param {string} service - Service identifier.
 * @param {string} envVarName - Name of the fallback environment variable (e.g. `'PAGESPEED_API_KEY'`).
 * @returns {Promise<string|null>} Decrypted API key, env key, or `null` if neither is set.
 */
export async function getApiKeyWithFallback(userId, service, envVarName) {
  const userKey = await getApiKey(userId, service);
  if (userKey) {
    logger.debug("Using user-provided API key for service: %s", service);
    return userKey;
  }

  const envKey = process.env[envVarName];
  if (envKey) {
    logger.debug("Using environment API key for service: %s", service);
    return envKey;
  }

  logger.warn("No API key found for service: %s", service);
  return null;
}
