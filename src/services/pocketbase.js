import PocketBase from "pocketbase";
import dotenv from "dotenv";

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
      console.log("Successfully authenticated with Pocketbase as admin.");
      isInitialAuthDone = true;
    } else {
      console.log("PocketBase admin token refreshed successfully.");
    }
  } catch (error) {
    console.error("FATAL: Failed to authenticate with Pocketbase as admin:", error.message);
    if (!isInitialAuthDone) {
      process.exit(1);
    }
  }
}
