import { pbAdmin, ensureAdminAuth } from "./pocketbase.js";
import logger from "../utils/logger.js";

const settingsCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

export async function getSetting(userId, key, defaultValue = null) {
  const cacheKey = `${userId}:${key}`;
  const cached = settingsCache.get(cacheKey);

  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return cached.value;
  }

  try {
    await ensureAdminAuth();
    const setting = await pbAdmin.collection("app_settings").getFirstListItem(`user="${userId}" && key="${key}"`);
    const value = parseValue(setting.value);
    settingsCache.set(cacheKey, { value, cachedAt: Date.now() });
    return value;
  } catch (e) {
    if (e.status === 404) {
      settingsCache.set(cacheKey, { value: defaultValue, cachedAt: Date.now() });
      return defaultValue;
    }
    logger.error("Error getting setting %s for user %s: %o", key, userId, e);
    return defaultValue;
  }
}

export async function getSettings(userId, keys) {
  const results = {};

  for (const key of keys) {
    results[key] = await getSetting(userId, key, false);
  }

  return results;
}

export async function setSetting(userId, key, value, description = "") {
  const cacheKey = `${userId}:${key}`;
  const stringValue = stringifyValue(value);

  try {
    await ensureAdminAuth();

    try {
      const existing = await pbAdmin.collection("app_settings").getFirstListItem(`user="${userId}" && key="${key}"`);
      await pbAdmin.collection("app_settings").update(existing.id, {
        value: stringValue,
        description: description || existing.description,
      });
      logger.debug("Updated setting %s for user %s", key, userId);
    } catch (e) {
      if (e.status === 404) {
        await pbAdmin.collection("app_settings").create({
          user: userId,
          key: key,
          value: stringValue,
          description: description,
        });
        logger.debug("Created setting %s for user %s", key, userId);
      } else {
        throw e;
      }
    }

    settingsCache.set(cacheKey, { value, cachedAt: Date.now() });
  } catch (e) {
    logger.error("Error setting %s for user %s: %o", key, userId, e);
    throw e;
  }
}

export async function deleteSetting(userId, key) {
  const cacheKey = `${userId}:${key}`;

  try {
    await ensureAdminAuth();
    const existing = await pbAdmin.collection("app_settings").getFirstListItem(`user="${userId}" && key="${key}"`);
    await pbAdmin.collection("app_settings").delete(existing.id);
    settingsCache.delete(cacheKey);
    logger.debug("Deleted setting %s for user %s", key, userId);
    return true;
  } catch (e) {
    if (e.status === 404) {
      return false;
    }
    logger.error("Error deleting setting %s for user %s: %o", key, userId, e);
    throw e;
  }
}

export async function getAllSettings(userId) {
  try {
    await ensureAdminAuth();
    const settings = await pbAdmin.collection("app_settings").getFullList({
      filter: `user="${userId}"`,
    });

    const result = {};
    for (const setting of settings) {
      result[setting.key] = parseValue(setting.value);
      const cacheKey = `${userId}:${setting.key}`;
      settingsCache.set(cacheKey, { value: result[setting.key], cachedAt: Date.now() });
    }

    return result;
  } catch (e) {
    logger.error("Error getting all settings for user %s: %o", userId, e);
    return {};
  }
}

export function clearCache(userId = null) {
  if (userId) {
    for (const key of settingsCache.keys()) {
      if (key.startsWith(`${userId}:`)) {
        settingsCache.delete(key);
      }
    }
  } else {
    settingsCache.clear();
  }
}

function parseValue(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (value === "undefined") return undefined;

  const num = Number(value);
  if (!Number.isNaN(num) && value.trim() !== "") return num;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function stringifyValue(value) {
  if (typeof value === "boolean") return value.toString();
  if (typeof value === "number") return value.toString();
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
