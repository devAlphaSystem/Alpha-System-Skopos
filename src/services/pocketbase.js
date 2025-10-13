import PocketBase from "pocketbase";
import dotenv from "dotenv";

dotenv.config();

export const pb = new PocketBase(process.env.POCKETBASE_URL);
pb.autoCancellation(false);

export const pbAdmin = new PocketBase(process.env.POCKETBASE_URL);
pbAdmin.autoCancellation(false);

try {
  await pbAdmin.collection("_superusers").authWithPassword(process.env.POCKETBASE_ADMIN_EMAIL, process.env.POCKETBASE_ADMIN_PASSWORD);
  console.log("Successfully authenticated with Pocketbase as admin.");
} catch (error) {
  console.error("Failed to authenticate with Pocketbase as admin:", error.message);
  process.exit(1);
}
