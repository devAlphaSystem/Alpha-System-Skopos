import { createHash } from "node:crypto";
import dotenv from "dotenv";

dotenv.config();

const secretSalt = process.env.SECRET_SALT;

if (!secretSalt) {
  console.error("FATAL ERROR: SECRET_SALT is not defined in the environment variables.");
  process.exit(1);
}

export function generateVisitorId(ip, userAgent, websiteId) {
  const data = `${ip}-${userAgent}-${websiteId}-${secretSalt}`;
  return createHash("sha256").update(data).digest("hex");
}
