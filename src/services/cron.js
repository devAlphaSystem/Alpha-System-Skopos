import cron from "node-cron";
import { subDays, startOfDay, endOfDay } from "date-fns";
import { pbAdmin, ensureAdminAuth } from "./pocketbase.js";
import { calculateMetricsFromRecords } from "./analyticsService.js";
import { triggerNotification } from "./notificationService.js";
import { resolveRuleWebsites, createDailySummaryEventData } from "./notificationRuleUtils.js";
import { getSetting } from "./appSettingsService.js";
import logger from "../utils/logger.js";

const DELETE_BATCH_SIZE = 200;

async function batchDelete(collection, filter) {
  let totalDeleted = 0;
  while (true) {
    const batch = await pbAdmin.collection(collection).getList(1, DELETE_BATCH_SIZE, {
      filter,
      fields: "id",
      $autoCancel: false,
    });
    if (batch.items.length === 0) break;
    for (const record of batch.items) {
      await pbAdmin.collection(collection).delete(record.id);
    }
    totalDeleted += batch.items.length;
    if (batch.items.length < DELETE_BATCH_SIZE) break;
  }
  return totalDeleted;
}

async function enforceDataRetention() {
  logger.info("Running cron job: Enforcing data retention policies...");
  try {
    await ensureAdminAuth();
    const websites = await pbAdmin.collection("websites").getFullList({
      filter: "dataRetentionDays > 0",
    });
    logger.debug("Found %d websites with data retention policies.", websites.length);

    for (const website of websites) {
      const retentionDays = website.dataRetentionDays;
      const cutoffDate = subDays(new Date(), retentionDays);
      const cutoffISO = cutoffDate.toISOString().replace("T", " ");
      const filter = `session.website.id = "${website.id}" && created < "${cutoffISO}"`;
      logger.debug("Enforcing %d-day retention for website %s (ID: %s). Cutoff: %s", retentionDays, website.name, website.id, cutoffISO);

      const deletedEvents = await batchDelete("events", filter);
      const deletedSessions = await batchDelete("sessions", `website.id = "${website.id}" && created < "${cutoffISO}"`);
      if (deletedEvents > 0 || deletedSessions > 0) {
        logger.info(`Data retention for ${website.name}: Removed ${deletedEvents} events and ${deletedSessions} sessions.`);
      }
    }
    logger.info("Finished enforcing data retention.");
  } catch (error) {
    logger.error("Error during data retention cron job: %o", error);
  }
}

async function pruneOldRawData() {
  logger.info("Running cron job: Pruning old raw data (sessions and events)...");
  try {
    await ensureAdminAuth();
    const retentionDays = Number.parseInt(process.env.DATA_RETENTION_DAYS || "180", 10);
    const cutoffDate = subDays(new Date(), retentionDays);
    const cutoffISO = cutoffDate.toISOString().replace("T", " ");
    logger.debug("Pruning raw data older than %s (Retention: %d days)", cutoffISO, retentionDays);

    const deletedSessions = await batchDelete("sessions", `created < "${cutoffISO}"`);
    const deletedEvents = await batchDelete("events", `created < "${cutoffISO}"`);

    logger.info(`Pruned ${deletedSessions} old sessions and ${deletedEvents} old events.`);
  } catch (error) {
    logger.error("Error during raw data pruning cron job: %o", error);
  }
}

async function cleanupOrphanedData() {
  logger.info("Running cron job: Cleaning up orphaned records...");
  try {
    await ensureAdminAuth();
    const websites = await pbAdmin.collection("websites").getFullList({
      fields: "id,name",
    });
    logger.debug("Checking %d websites for orphaned records.", websites.length);

    let totalOrphanedVisitors = 0;
    const VISITOR_BATCH_SIZE = 100;

    for (const website of websites) {
      try {
        let page = 1;
        let hasMore = true;
        while (hasMore) {
          const batch = await pbAdmin.collection("visitors").getList(page, VISITOR_BATCH_SIZE, {
            filter: `website.id = "${website.id}"`,
            fields: "id,visitorId",
            $autoCancel: false,
          });

          for (const visitor of batch.items) {
            const sessions = await pbAdmin.collection("sessions").getList(1, 1, {
              filter: `visitor.id = "${visitor.id}"`,
              $autoCancel: false,
            });

            if (sessions.totalItems === 0) {
              await pbAdmin.collection("visitors").delete(visitor.id);
              totalOrphanedVisitors++;
              logger.debug("Deleted orphaned visitor: %s", visitor.id);
            }
          }

          hasMore = batch.items.length === VISITOR_BATCH_SIZE && page * VISITOR_BATCH_SIZE < batch.totalItems;
          page++;
        }
      } catch (error) {
        logger.error("Error cleaning up website %s: %o", website.id, error);
      }
    }

    logger.info(`Cleanup complete: Removed ${totalOrphanedVisitors} orphaned visitors.`);
  } catch (error) {
    logger.error("Error during orphaned data cleanup cron job: %o", error);
  }
}

async function sendDailySummaryReports() {
  logger.info("Running cron job: Sending daily summary reports...");
  try {
    await ensureAdminAuth();

    const rules = await pbAdmin.collection("notyf_rules").getFullList({
      filter: `eventType = "daily_summary" && isActive = true`,
      expand: "website,user",
    });

    if (rules.length === 0) {
      logger.debug("No active daily summary notification rules found.");
      return;
    }

    logger.debug("Found %d active daily summary notification rules.", rules.length);

    const now = new Date();
    const yesterdayDate = subDays(now, 1);
    const yesterday = startOfDay(yesterdayDate);
    const yesterdayEnd = endOfDay(yesterdayDate);
    const yesterdayDateString = yesterday.toISOString().slice(0, 10);

    logger.debug("Daily summary date range: %s to %s", yesterday.toISOString(), yesterdayEnd.toISOString());

    for (const rule of rules) {
      try {
        const userId = rule.user;

        if (!userId) {
          logger.warn("Skipping rule %s: missing user", rule.id);
          continue;
        }

        const targetWebsites = await resolveRuleWebsites(rule);

        if (targetWebsites.length === 0) {
          logger.warn("Skipping rule %s: no websites resolved for user %s", rule.id, userId);
          continue;
        }

        for (const website of targetWebsites) {
          let summaryData = {};
          try {
            summaryData = await calculateMetricsFromRecords(website.id, yesterday, yesterdayEnd);
          } catch (error) {
            logger.error("Error calculating metrics for website %s on %s: %o", website.id, yesterdayDateString, error);
            summaryData = {};
          }

          const eventData = createDailySummaryEventData(website, summaryData, { reportDate: yesterdayDateString });

          await triggerNotification(userId, website.id, "daily_summary", eventData);

          logger.info("Daily summary sent for website %s to %s via rule %s", website.name, rule.recipientEmail, rule.id);
        }
      } catch (error) {
        logger.error("Error sending daily summary for rule %s: %o", rule.id, error);
      }
    }

    logger.info("Finished sending daily summary reports.");
  } catch (error) {
    logger.error("Error during daily summary reports cron job: %o", error);
  }
}

async function checkErrorThresholds() {
  logger.info("Running cron job: Checking error thresholds...");
  try {
    await ensureAdminAuth();

    const rules = await pbAdmin.collection("notyf_rules").getFullList({
      filter: `eventType = "error_threshold" && isActive = true`,
      expand: "website,user",
    });

    if (rules.length === 0) {
      logger.debug("No active error threshold notification rules found.");
      return;
    }

    logger.debug("Found %d active error threshold notification rules.", rules.length);

    const oneDayAgo = subDays(new Date(), 1).toISOString();

    for (const rule of rules) {
      try {
        const userId = rule.user;

        if (!userId) {
          logger.warn("Skipping rule %s: missing user", rule.id);
          continue;
        }

        const targetWebsites = await resolveRuleWebsites(rule);

        if (targetWebsites.length === 0) {
          logger.warn("Skipping rule %s: no websites resolved for user %s", rule.id, userId);
          continue;
        }

        const threshold = rule.metadata?.threshold || 10;
        const timeWindow = rule.metadata?.timeWindowHours || 24;
        const cutoffDate = subDays(new Date(), timeWindow / 24)
          .toISOString()
          .replace("T", " ");

        for (const website of targetWebsites) {
          const jsErrors = await pbAdmin.collection("js_errors").getFullList({
            filter: `website.id = "${website.id}" && lastSeen >= "${cutoffDate}"`,
            sort: "-count",
            $autoCancel: false,
          });

          const totalErrorCount = jsErrors.reduce((sum, error) => sum + error.count, 0);

          if (totalErrorCount >= threshold) {
            const topError = jsErrors.length > 0 ? jsErrors[0].errorMessage : "N/A";

            const eventData = {
              websiteName: website.name,
              errorCount: totalErrorCount,
              threshold: threshold,
              topError: topError,
              uniqueErrors: jsErrors.length,
            };

            await triggerNotification(userId, website.id, "error_threshold", eventData);

            logger.info("Error threshold exceeded for website %s: %d errors (threshold: %d)", website.name, totalErrorCount, threshold);
          } else {
            logger.debug("Error threshold not exceeded for website %s: %d errors (threshold: %d)", website.name, totalErrorCount, threshold);
          }
        }
      } catch (error) {
        logger.error("Error checking error threshold for rule %s: %o", rule.id, error);
      }
    }

    logger.info("Finished checking error thresholds.");
  } catch (error) {
    logger.error("Error during error threshold check cron job: %o", error);
  }
}

async function discardShortSessions() {
  logger.info("Running cron job: Discarding short sessions...");
  try {
    await ensureAdminAuth();

    const settingsRecords = await pbAdmin.collection("app_settings").getFullList({
      filter: `key = "discardShortSessions" && value = "true"`,
      fields: "user",
    });

    if (settingsRecords.length === 0) {
      logger.debug("No users with discardShortSessions enabled.");
      return;
    }

    const userIds = settingsRecords.map((r) => r.user);
    logger.debug("Found %d users with discardShortSessions enabled.", userIds.length);

    let totalDiscarded = 0;

    for (const userId of userIds) {
      try {
        const websites = await pbAdmin.collection("websites").getFullList({
          filter: `user = "${userId}" && isArchived = false`,
          fields: "id,name",
          $autoCancel: false,
        });

        for (const website of websites) {
          try {
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString().replace("T", " ");
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString().replace("T", " ");

            const oldSessions = await pbAdmin.collection("sessions").getFullList({
              filter: `website.id = "${website.id}" && updated < "${fiveMinutesAgo}" && created >= "${oneHourAgo}"`,
              fields: "id,created,updated",
              $autoCancel: false,
            });

            let discardedForWebsite = 0;

            for (const session of oldSessions) {
              const sessionStart = new Date(session.created);
              const sessionEnd = new Date(session.updated);
              const durationSeconds = (sessionEnd - sessionStart) / 1000;

              if (durationSeconds < 1) {
                await batchDelete("events", `session.id = "${session.id}"`);
                await batchDelete("js_errors", `session.id = "${session.id}"`);
                await pbAdmin.collection("sessions").delete(session.id);
                discardedForWebsite++;
              }
            }

            if (discardedForWebsite > 0) {
              logger.info(`Discarded ${discardedForWebsite} short sessions for website ${website.name}`);
              totalDiscarded += discardedForWebsite;
            }
          } catch (error) {
            logger.error("Error discarding short sessions for website %s: %o", website.id, error);
          }
        }
      } catch (error) {
        logger.error("Error processing websites for user %s: %o", userId, error);
      }
    }

    if (totalDiscarded > 0) {
      logger.info(`Total short sessions discarded: ${totalDiscarded}`);
    }
  } catch (error) {
    logger.error("Error during short session discard cron job: %o", error);
  }
}

export function startCronJobs() {
  cron.schedule(
    "0 0 * * *",
    async () => {
      await enforceDataRetention();
      await pruneOldRawData();
      await cleanupOrphanedData();
      await sendDailySummaryReports();
    },
    {
      timezone: "UTC",
    },
  );

  cron.schedule("0 * * * *", checkErrorThresholds, {
    timezone: "UTC",
  });

  cron.schedule("*/5 * * * *", discardShortSessions, {
    timezone: "UTC",
  });

  logger.info("All cron jobs started successfully");
}
