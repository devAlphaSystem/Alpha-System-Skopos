import { pbAdmin, ensureAdminAuth } from "./pocketbase.js";
import logger from "./logger.js";

let isInitialized = false;
let userExists = false;

export async function initialize() {
  if (isInitialized) {
    return;
  }
  try {
    logger.info("Initializing application state...");
    await ensureAdminAuth();
    const users = await pbAdmin.collection("users").getList(1, 1);
    userExists = users.totalItems > 0;
    logger.info("User exists check complete. User exists: %s", userExists);
  } catch (error) {
    logger.error("Could not check for existing users during app state initialization: %o", error);
    userExists = false;
  } finally {
    isInitialized = true;
  }
}

export function doesUserExist() {
  if (!isInitialized) {
    const err = new Error("Application state not initialized. Call initialize() first.");
    logger.error(err);
    throw err;
  }
  return userExists;
}
