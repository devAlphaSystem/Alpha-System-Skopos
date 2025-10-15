import { pbAdmin, ensureAdminAuth } from "./pocketbase.js";
import { broadcast } from "./sseManager.js";

let isSubscribed = false;

export async function startRealtimeService() {
  if (isSubscribed) {
    return;
  }

  try {
    await ensureAdminAuth();
    pbAdmin.collection("dash_sum").subscribe("*", (e) => {
      if (e.record?.website) {
        broadcast({ type: "update", websiteId: e.record.website });
      }
    });
    isSubscribed = true;
  } catch (err) {
    console.error("Failed to subscribe to real-time events:", err);
  }
}
