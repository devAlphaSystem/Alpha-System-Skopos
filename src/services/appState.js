import { pbAdmin, ensureAdminAuth } from "./pocketbase.js";

let isInitialized = false;
let userExists = false;

export async function initialize() {
  if (isInitialized) {
    return;
  }
  try {
    await ensureAdminAuth();
    const users = await pbAdmin.collection("users").getList(1, 1);
    userExists = users.totalItems > 0;
  } catch (error) {
    console.error("Could not check for existing users:", error);
    userExists = false;
  } finally {
    isInitialized = true;
  }
}

export function doesUserExist() {
  if (!isInitialized) {
    throw new Error("Application state not initialized. Call initialize() first.");
  }
  return userExists;
}
