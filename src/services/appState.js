import { pbAdmin, ensureAdminAuth } from "./pocketbase.js";
import logger from "../utils/logger.js";

let isInitialized = false;
let userExists = false;

/**
 * Initialises application state by checking whether any user account exists in PocketBase.
 * Must be called once during server startup before any request handling begins.
 * Subsequent calls are no-ops unless `options.force` is true.
 *
 * @param {{ force?: boolean } | boolean} [options] - Pass `{ force: true }` or `true` to force a re-check.
 * @returns {Promise<void>}
 */
export async function initialize(options = {}) {
  const forceRefresh = typeof options === "boolean" ? options : options.force === true;

  if (isInitialized && !forceRefresh) {
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

/**
 * Returns whether a user account exists.
 * Throws if `initialize()` has not been called yet.
 *
 * @returns {boolean} True if at least one user record exists in PocketBase.
 * @throws {Error} If the application state has not been initialised.
 */
export function doesUserExist() {
  if (!isInitialized) {
    const err = new Error("Application state not initialized. Call initialize() first.");
    logger.error(err);
    throw err;
  }
  return userExists;
}
