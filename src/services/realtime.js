import { pbAdmin, ensureAdminAuth } from "./pocketbase.js";
import { broadcast } from "./sseManager.js";
import { triggerNotification } from "./notificationService.js";
import logger from "../utils/logger.js";

let isSubscribed = false;

export async function startRealtimeService() {
  if (isSubscribed) {
    return;
  }

  try {
    await ensureAdminAuth();

    pbAdmin.collection("sessions").subscribe("*", async (e) => {
      if (e.action === "create") {
        logger.debug("New session detected: %s", e.record?.id);
        try {
          const website = await pbAdmin.collection("websites").getOne(e.record.website, {
            expand: "user",
          });

          const userId = website.user;
          const websiteId = website.id;

          broadcast({
            type: "update",
            websiteId: websiteId,
            action: "session_created",
          });

          await triggerNotification(userId, websiteId, "new_session", {
            websiteName: website.name,
            device: e.record.device,
            browser: e.record.browser,
            os: e.record.os,
            country: e.record.country,
            state: e.record.state,
          });

          if (e.record.isNewVisitor) {
            await triggerNotification(userId, websiteId, "new_visitor", {
              websiteName: website.name,
              country: e.record.country,
              state: e.record.state,
              device: e.record.device,
              browser: e.record.browser,
              entryPath: e.record.entryPath,
              referrer: e.record.referrer,
            });
          }
        } catch (error) {
          logger.error("Error processing session notification: %o", error);
        }
      }
    });

    pbAdmin.collection("events").subscribe("*", async (e) => {
      if (e.action === "create") {
        logger.debug("Event detected: %s (type: %s)", e.record?.id, e.record?.type);

        try {
          const session = await pbAdmin.collection("sessions").getOne(e.record.session, {
            expand: "website,website.user",
          });

          const website = session.expand?.website;
          if (!website) {
            logger.warn("Website not found for session %s", session.id);
            return;
          }

          broadcast({
            type: "update",
            websiteId: website.id,
            action: "event_created",
            eventType: e.record.type,
          });

          if (e.record.type === "custom" && e.record.eventName) {
            const user = website.expand?.user;
            if (!user) {
              logger.warn("User not found for website %s", website.id);
              return;
            }

            await triggerNotification(user.id, website.id, "custom_event", {
              websiteName: website.name,
              eventName: e.record.eventName,
              path: e.record.path,
              eventData: e.record.eventData,
            });
          }
        } catch (error) {
          logger.error("Error processing event notification: %o", error);
        }
      }
    });

    isSubscribed = true;
    logger.info("Successfully subscribed to PocketBase real-time events for notifications.");
  } catch (err) {
    logger.error("Failed to subscribe to real-time events: %o", err);
  }
}
