import { pbAdmin, ensureAdminAuth } from "./pocketbase.js";
import { broadcast } from "./sseManager.js";
import logger from "./logger.js";

let isSubscribed = false;

export async function startRealtimeService() {
  if (isSubscribed) {
    return;
  }

  try {
    await ensureAdminAuth();
    pbAdmin.collection("dash_sum").subscribe("*", (e) => {
      logger.debug("Real-time event received: %o", e);
      if (e.record?.website) {
        broadcast({ type: "update", websiteId: e.record.website });
      }
    });
    isSubscribed = true;
    logger.info("Successfully subscribed to PocketBase real-time events.");
  } catch (err) {
    logger.error("Failed to subscribe to real-time events: %o", err);
  }
}
