import PocketBase from "pocketbase";
import dotenv from "dotenv";

dotenv.config();

export const pb = new PocketBase(process.env.POCKETBASE_URL);
pb.autoCancellation(false);

export const pbAdmin = new PocketBase(process.env.POCKETBASE_URL);
pbAdmin.autoCancellation(false);

const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL;
const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD;

async function refreshAdminAuth() {
  if (!adminEmail || !adminPassword) {
    console.error("Admin credentials not available for token refresh.");
    return;
  }
  try {
    await pbAdmin.collection("_superusers").authWithPassword(adminEmail, adminPassword);
    console.log("Successfully refreshed Pocketbase admin authentication token.");
  } catch (error) {
    console.error("Failed to refresh Pocketbase admin authentication token:", error.message);
  }
}

async function initializeAdminAuth() {
  if (!adminEmail || !adminPassword) {
    console.error("FATAL: POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD must be set in .env file.");
    process.exit(1);
  }

  try {
    await pbAdmin.collection("_superusers").authWithPassword(adminEmail, adminPassword);
    console.log("Successfully authenticated with Pocketbase as admin.");

    setInterval(refreshAdminAuth, 15 * 60 * 1000);
  } catch (error) {
    console.error("Failed to authenticate with Pocketbase as admin on startup:", error.message);
    process.exit(1);
  }
}

initializeAdminAuth();
