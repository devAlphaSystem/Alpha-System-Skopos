import dotenv from "dotenv";
import PocketBase from "pocketbase";
import logger from "../utils/logger.js";

dotenv.config();

const pbMode = (process.env.POCKETBASE_MODE || "external").toLowerCase();

if (pbMode !== "external" && pbMode !== "embedded") {
  throw new Error(`Invalid POCKETBASE_MODE "${process.env.POCKETBASE_MODE}". Must be "external" or "embedded".`);
}

function getPbUrl() {
  return process.env.POCKETBASE_URL || "http://127.0.0.1:8090";
}

if (pbMode === "external" && !process.env.POCKETBASE_URL) {
  throw new Error('POCKETBASE_URL is required when POCKETBASE_MODE is "external".');
}

export const POCKETBASE_MODE = pbMode;

export const pb = new PocketBase(getPbUrl());
pb.autoCancellation(false);

export const pbAdmin = new PocketBase(getPbUrl());
pbAdmin.autoCancellation(false);

const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL;
const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD;
let isInitialAuthDone = false;

/**
 * Ensures the admin PocketBase client (`pbAdmin`) holds a valid authentication token.
 * Re-authenticates if the token has expired or is missing. Exits the process on the
 * first authentication failure (before any requests have been served).
 *
 * @returns {Promise<void>}
 */
export async function ensureAdminAuth() {
  const currentUrl = getPbUrl();

  if (pbAdmin.baseUrl !== currentUrl) {
    pb.baseUrl = currentUrl;
    pbAdmin.baseUrl = currentUrl;
  }

  if (pbAdmin.authStore.isValid) {
    return;
  }

  try {
    await pbAdmin.collection("_superusers").authWithPassword(adminEmail, adminPassword);
    if (!isInitialAuthDone) {
      logger.info("Successfully authenticated with Pocketbase as admin.");
      isInitialAuthDone = true;
    } else {
      logger.info("PocketBase admin token refreshed successfully.");
    }
  } catch (error) {
    logger.error("FATAL: Failed to authenticate with Pocketbase as admin at %s: %s", process.env.POCKETBASE_URL, error.message);
    if (!isInitialAuthDone) {
      process.exit(1);
    }
  }
}
