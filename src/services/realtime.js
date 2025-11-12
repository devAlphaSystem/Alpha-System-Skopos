import { pbAdmin, ensureAdminAuth } from "./pocketbase.js";
import { broadcast } from "./sseManager.js";
import { triggerNotification } from "./notificationService.js";
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

    pbAdmin.collection("sessions").subscribe("*", async (e) => {
      if (e.action === "create") {
        logger.debug("New session detected: %s", e.record?.id);
        try {
          const website = await pbAdmin.collection("websites").getOne(e.record.website, {
            expand: "user",
          });

          const userId = website.user;
          const websiteId = website.id;

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
      if (e.action === "create" && e.record.type === "custom" && e.record.eventName) {
        logger.debug("Custom event detected: %s", e.record.eventName);
        try {
          const session = await pbAdmin.collection("sessions").getOne(e.record.session, {
            expand: "website,website.user",
          });

          const website = session.expand?.website;
          if (!website) {
            logger.warn("Website not found for session %s", session.id);
            return;
          }

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
        } catch (error) {
          logger.error("Error processing custom event notification: %o", error);
        }
      }
    });

    isSubscribed = true;
    logger.info("Successfully subscribed to PocketBase real-time events for notifications.");
  } catch (err) {
    logger.error("Failed to subscribe to real-time events: %o", err);
  }
}
