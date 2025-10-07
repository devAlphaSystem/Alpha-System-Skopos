import PocketBase from "pocketbase";
import dotenv from "dotenv";

dotenv.config();

export const pb = new PocketBase(process.env.POCKETBASE_URL);

try {
  await pb.collection("_superusers").authWithPassword(process.env.POCKETBASE_ADMIN_EMAIL, process.env.POCKETBASE_ADMIN_PASSWORD);
  pb.autoCancellation(false);
  console.log("Successfully authenticated with Pocketbase as admin.");
} catch (error) {
  console.error("Failed to authenticate with Pocketbase:", error.message);
  process.exit(1);
}
