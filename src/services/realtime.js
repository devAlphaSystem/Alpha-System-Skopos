import { pbAdmin, ensureAdminAuth } from "./pocketbase.js";
import { broadcast } from "./sseManager.js";
import { triggerNotification } from "./notificationService.js";
import { getSetting } from "./appSettingsService.js";
import cacheService from "./cacheService.js";
import logger from "../utils/logger.js";

let isSubscribed = false;

async function fetchSessionContext(sessionId) {
  if (!sessionId) {
    logger.warn("Missing session id while resolving context.");
    return null;
  }

  try {
    const session = await pbAdmin.collection("sessions").getOne(sessionId, {
      expand: "website,website.user",
    });
    const website = session.expand?.website;
    const user = website?.expand?.user;
    if (!website) {
      logger.warn("Website relation missing on session %s", sessionId);
      return { session };
    }
    return { session, website, user };
  } catch (error) {
    logger.warn("Failed to fetch session context for %s: %s", sessionId, error.message);
    return null;
  }
}

async function fetchWebsiteWithUser(websiteId) {
  if (!websiteId) {
    logger.warn("Missing website id while resolving website context.");
    return null;
  }

  try {
    return await pbAdmin.collection("websites").getOne(websiteId, {
      expand: "user",
    });
  } catch (error) {
    logger.warn("Failed to fetch website %s: %s", websiteId, error.message);
    return null;
  }
}

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
          const website = await fetchWebsiteWithUser(e.record.website);
          if (!website) {
            logger.warn("Unable to resolve website for session %s", e.record?.id);
            return;
          }

          const userId = website.user;
          const websiteId = website.id;

          cacheService.invalidateWebsite(websiteId);
          cacheService.invalidateUser(userId);

          broadcast({
            type: "update",
            websiteId: websiteId,
            action: "session_created",
          });

          const sendVisitorNotifications = async () => {
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
          };

          const shouldDiscardShort = await getSetting(userId, "discardShortSessions", false);

          if (shouldDiscardShort) {
            logger.debug("Delaying visitor notification for session %s (validation period)", e.record.id);
            setTimeout(async () => {
              try {
                await ensureAdminAuth();
                const session = await pbAdmin
                  .collection("sessions")
                  .getOne(e.record.id)
                  .catch(() => null);

                if (!session) {
                  logger.debug("Session %s was already discarded or deleted, skipping notification", e.record.id);
                  return;
                }

                const duration = (new Date(session.updated) - new Date(session.created)) / 1000;

                if (duration < 1) {
                  const events = await pbAdmin.collection("events").getList(1, 2, {
                    filter: `session = "${session.id}"`,
                  });

                  if (events.totalItems <= 1) {
                    logger.info("Session %s identified as short/bot-like after 30s. Skipping notification.", session.id);
                    return;
                  }
                }

                await sendVisitorNotifications();
              } catch (err) {
                logger.error("Error in delayed notification validation: %o", err);
              }
            }, 30000);
          } else {
            await sendVisitorNotifications();
          }
        } catch (error) {
          logger.error("Error processing session notification: %o", error);
        }
      }

      if (e.action === "delete") {
        const websiteId = e.record?.website;
        if (!websiteId) {
          logger.warn("Session delete event without website id for session %s", e.record?.id);
        }

        if (websiteId) {
          cacheService.invalidateWebsite(websiteId);
        }

        broadcast({
          type: "update",
          websiteId: websiteId || null,
          action: "session_deleted",
        });
      }
    });

    pbAdmin.collection("events").subscribe("*", async (e) => {
      if (e.action === "create") {
        logger.debug("Event detected: %s (type: %s)", e.record?.id, e.record?.type);

        try {
          const context = await fetchSessionContext(e.record.session);
          if (!context?.website) {
            logger.warn("Unable to resolve website for event %s", e.record?.id);
            return;
          }

          const { session, website, user } = context;
          if (!website) {
            logger.warn("Website not found for session %s", session.id);
            return;
          }

          cacheService.invalidateWebsite(website.id);
          if (user) {
            cacheService.invalidateUser(user.id);
          }

          broadcast({
            type: "update",
            websiteId: website.id,
            action: "event_created",
            eventType: e.record.type,
          });

          if (e.record.type === "custom" && e.record.eventName) {
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

      if (e.action === "delete") {
        logger.debug("Event deleted: %s (type: %s)", e.record?.id, e.record?.type);
        try {
          const context = await fetchSessionContext(e.record?.session);
          const websiteId = context?.website?.id;
          if (!websiteId) {
            logger.warn("Unable to resolve website for deleted event %s", e.record?.id);
          }

          if (websiteId) {
            cacheService.invalidateWebsite(websiteId);
          }

          broadcast({
            type: "update",
            websiteId: websiteId || null,
            action: "event_deleted",
            eventType: e.record?.type,
          });
        } catch (error) {
          logger.error("Error processing event deletion notification: %o", error);
        }
      }
    });

    isSubscribed = true;
    logger.info("Successfully subscribed to PocketBase real-time events for notifications.");
  } catch (err) {
    logger.error("Failed to subscribe to real-time events: %o", err);
  }
}
