import dotenv from "dotenv";
import PocketBase from "pocketbase";
import logger from "./logger.js";

dotenv.config();

export const pb = new PocketBase(process.env.POCKETBASE_URL);
pb.autoCancellation(false);

export const pbAdmin = new PocketBase(process.env.POCKETBASE_URL);
pbAdmin.autoCancellation(false);

const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL;
const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD;
let isInitialAuthDone = false;

export async function ensureAdminAuth() {
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
    logger.error("FATAL: Failed to authenticate with Pocketbase as admin: %s", error.message);
    if (!isInitialAuthDone) {
      process.exit(1);
    }
  }
}
