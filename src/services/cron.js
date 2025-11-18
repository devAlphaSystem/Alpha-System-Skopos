import cron from "node-cron";
import { subDays, startOfYesterday } from "date-fns";
import { pbAdmin, ensureAdminAuth } from "./pocketbase.js";
import { calculateMetrics } from "./analyticsService.js";
import { cleanupOrphanedRecords } from "./dashSummary.js";
import { triggerNotification } from "./notificationService.js";
import logger from "../utils/logger.js";

async function pruneOldSummaries() {
  logger.info("Running cron job: Pruning old dashboard summaries...");
  try {
    await ensureAdminAuth();
    const retentionDays = Number.parseInt(process.env.DATA_RETENTION_DAYS || "180", 10);
    const cutoffDate = subDays(new Date(), retentionDays);
    const filterDate = cutoffDate.toISOString().split("T")[0];
    logger.debug("Pruning summaries older than %s (Retention: %d days)", filterDate, retentionDays);

    const recordsToDelete = await pbAdmin.collection("dash_sum").getFullList({
      filter: `date < "${filterDate}"`,
      fields: "id",
    });

    if (recordsToDelete.length > 0) {
      logger.debug("Found %d old summary records to prune.", recordsToDelete.length);
      for (const record of recordsToDelete) {
        await pbAdmin.collection("dash_sum").delete(record.id);
      }
    }

    logger.info(`Pruned ${recordsToDelete.length} old summary records.`);
  } catch (error) {
    logger.error("Error during summary pruning cron job: %o", error);
  }
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
      const cutoffISO = cutoffDate.toISOString();
      const filter = `session.website.id = "${website.id}" && created < "${cutoffISO}"`;
      logger.debug("Enforcing %d-day retention for website %s (ID: %s). Cutoff: %s", retentionDays, website.name, website.id, cutoffISO);

      const eventsToDelete = await pbAdmin.collection("events").getFullList({
        filter: filter,
        fields: "id",
      });
      if (eventsToDelete.length > 0) {
        logger.debug("Found %d events to delete for website %s.", eventsToDelete.length, website.name);
        for (const event of eventsToDelete) {
          await pbAdmin.collection("events").delete(event.id);
        }
      }

      const sessionsToDelete = await pbAdmin.collection("sessions").getFullList({
        filter: `website.id = "${website.id}" && created < "${cutoffISO}"`,
        fields: "id",
      });
      if (sessionsToDelete.length > 0) {
        logger.debug("Found %d sessions to delete for website %s.", sessionsToDelete.length, website.name);
        for (const session of sessionsToDelete) {
          await pbAdmin.collection("sessions").delete(session.id);
        }
      }

      logger.info(`Data retention for ${website.name}: Removed ${eventsToDelete.length} events and ${sessionsToDelete.length} sessions.`);
    }
    logger.info("Finished enforcing data retention.");
  } catch (error) {
    logger.error("Error during data retention cron job: %o", error);
  }
}

async function finalizeDailySummaries() {
  logger.info("Running cron job: Finalizing yesterday's summaries...");
  try {
    await ensureAdminAuth();
    const yesterday = startOfYesterday();
    const yesterdayStart = yesterday.toISOString();
    const yesterdayEnd = new Date(yesterday.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString();

    const summariesToFinalize = await pbAdmin.collection("dash_sum").getFullList({
      filter: `date >= "${yesterdayStart}" && date <= "${yesterdayEnd}" && isFinalized = false`,
    });

    logger.debug("Found %d summaries to finalize for yesterday.", summariesToFinalize.length);

    for (const summary of summariesToFinalize) {
      const websiteId = summary.website;
      const dateFilter = `created >= "${yesterdayStart}" && created <= "${yesterdayEnd}"`;
      logger.debug("Finalizing summary for website: %s", websiteId);

      const sessions = await pbAdmin.collection("sessions").getFullList({
        filter: `website.id = "${websiteId}" && ${dateFilter}`,
      });
      const events = await pbAdmin.collection("events").getFullList({
        filter: `session.website.id = "${websiteId}" && ${dateFilter}`,
      });

      if (sessions.length > 0 || events.length > 0) {
        logger.debug("Calculating final metrics for website %s with %d sessions and %d events.", websiteId, sessions.length, events.length);
        const finalMetrics = calculateMetrics(sessions, events);
        const updatedSummary = {
          ...summary.summary,
          bounceRate: finalMetrics.bounceRate,
          avgSessionDuration: finalMetrics.avgSessionDuration,
        };

        await pbAdmin.collection("dash_sum").update(summary.id, {
          summary: updatedSummary,
          isFinalized: true,
        });
        logger.info(`Finalized summary for website ${websiteId}`);
      } else {
        logger.debug("No sessions or events for website %s yesterday, marking as finalized.", websiteId);
        await pbAdmin.collection("dash_sum").update(summary.id, { isFinalized: true });
      }
    }
    logger.info("Finished finalizing daily summaries.");
  } catch (error) {
    logger.error("Error during summary finalization cron job: %o", error);
  }
}

async function pruneOldRawData() {
  logger.info("Running cron job: Pruning old raw data (sessions and events)...");
  try {
    await ensureAdminAuth();
    const retentionDays = Number.parseInt(process.env.DATA_RETENTION_DAYS || "180", 10);
    const cutoffDate = subDays(new Date(), retentionDays);
    const cutoffISO = cutoffDate.toISOString();
    logger.debug("Pruning raw data older than %s (Retention: %d days)", cutoffISO, retentionDays);

    const sessionsToDelete = await pbAdmin.collection("sessions").getFullList({
      filter: `created < "${cutoffISO}"`,
      fields: "id",
    });

    if (sessionsToDelete.length > 0) {
      logger.debug("Found %d old session records to prune.", sessionsToDelete.length);
      for (const record of sessionsToDelete) {
        await pbAdmin.collection("sessions").delete(record.id);
      }
    }

    const eventsToDelete = await pbAdmin.collection("events").getFullList({
      filter: `created < "${cutoffISO}"`,
      fields: "id",
    });

    if (eventsToDelete.length > 0) {
      logger.debug("Found %d old event records to prune.", eventsToDelete.length);
      for (const record of eventsToDelete) {
        await pbAdmin.collection("events").delete(record.id);
      }
    }

    logger.info(`Pruned ${sessionsToDelete.length} old sessions and ${eventsToDelete.length} old events.`);
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
    let totalEmptyDashSums = 0;

    for (const website of websites) {
      try {
        const result = await cleanupOrphanedRecords(website.id);
        totalOrphanedVisitors += result.orphanedVisitors;
        totalEmptyDashSums += result.emptyDashSums;
      } catch (error) {
        logger.error("Error cleaning up website %s: %o", website.id, error);
      }
    }

    logger.info(`Cleanup complete: Removed ${totalOrphanedVisitors} orphaned visitors and ${totalEmptyDashSums} empty dash_sum records.`);
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

    const yesterday = startOfYesterday();
    const yesterdayDate = yesterday.toISOString().slice(0, 10);

    for (const rule of rules) {
      try {
        const websiteId = rule.website;
        const userId = rule.user;

        if (!websiteId || !userId) {
          logger.warn("Skipping rule %s: missing website or user", rule.id);
          continue;
        }

        const website = rule.expand?.website || (await pbAdmin.collection("websites").getOne(websiteId));

        let summary;
        try {
          const summaryRecord = await pbAdmin.collection("dash_sum").getFirstListItem(`website.id="${websiteId}" && date ~ "${yesterdayDate}%"`);
          summary = summaryRecord.summary || {};
        } catch (error) {
          if (error.status === 404) {
            logger.debug("No summary found for website %s on %s, using empty metrics", websiteId, yesterdayDate);
            summary = {
              pageViews: 0,
              visitors: 0,
              newVisitors: 0,
              sessions: 0,
            };
          } else {
            throw error;
          }
        }

        const eventData = {
          websiteName: website.name,
          pageViews: summary.pageViews || 0,
          uniqueVisitors: summary.visitors || 0,
          newVisitors: summary.newVisitors || 0,
          sessions: summary.engagedSessions || 0,
        };

        await triggerNotification(userId, websiteId, "daily_summary", eventData);

        logger.info("Daily summary sent for website %s to %s", website.name, rule.recipientEmail);
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
        const websiteId = rule.website;
        const userId = rule.user;

        if (!websiteId || !userId) {
          logger.warn("Skipping rule %s: missing website or user", rule.id);
          continue;
        }

        const threshold = rule.metadata?.threshold || 10;
        const timeWindow = rule.metadata?.timeWindowHours || 24;
        const cutoffDate = subDays(new Date(), timeWindow / 24).toISOString();

        const website = rule.expand?.website || (await pbAdmin.collection("websites").getOne(websiteId));

        const jsErrors = await pbAdmin.collection("js_errors").getFullList({
          filter: `website.id = "${websiteId}" && lastSeen >= "${cutoffDate}"`,
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

          await triggerNotification(userId, websiteId, "error_threshold", eventData);

          logger.info("Error threshold exceeded for website %s: %d errors (threshold: %d)", website.name, totalErrorCount, threshold);
        } else {
          logger.debug("Error threshold not exceeded for website %s: %d errors (threshold: %d)", website.name, totalErrorCount, threshold);
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

async function checkTrafficSpikes() {
  logger.info("Running cron job: Checking for traffic spikes...");
  try {
    await ensureAdminAuth();

    const rules = await pbAdmin.collection("notyf_rules").getFullList({
      filter: `eventType = "traffic_spike" && isActive = true`,
      expand: "website,user",
    });

    if (rules.length === 0) {
      logger.debug("No active traffic spike notification rules found.");
      return;
    }

    logger.debug("Found %d active traffic spike notification rules.", rules.length);

    for (const rule of rules) {
      try {
        const websiteId = rule.website;
        const userId = rule.user;

        if (!websiteId || !userId) {
          logger.warn("Skipping rule %s: missing website or user", rule.id);
          continue;
        }

        const spikeThreshold = rule.metadata?.spikeThreshold || 200;

        const website = rule.expand?.website || (await pbAdmin.collection("websites").getOne(websiteId));

        const thirtyMinutesAgo = subDays(new Date(), 30 / (24 * 60)).toISOString();
        const currentSessions = await pbAdmin.collection("sessions").getFullList({
          filter: `website.id = "${websiteId}" && updated >= "${thirtyMinutesAgo}"`,
          fields: "id",
          $autoCancel: false,
        });

        const currentVisitors = currentSessions.length;

        const sevenDaysAgo = subDays(new Date(), 7);
        const yesterday = subDays(new Date(), 1);
        const summaries = await pbAdmin.collection("dash_sum").getFullList({
          filter: `website.id = "${websiteId}" && date >= "${sevenDaysAgo.toISOString().slice(0, 10)}" && date <= "${yesterday.toISOString().slice(0, 10)}"`,
          $autoCancel: false,
        });

        if (summaries.length === 0) {
          logger.debug("No historical data for website %s, skipping traffic spike check", website.name);
          continue;
        }

        const totalVisitors = summaries.reduce((sum, s) => sum + (s.summary?.visitors || 0), 0);
        const averageVisitors = Math.ceil(totalVisitors / summaries.length);

        const averageVisitorsPerWindow = Math.max(1, Math.ceil(averageVisitors / 48));

        const increasePercentage = averageVisitorsPerWindow > 0 ? Math.round(((currentVisitors - averageVisitorsPerWindow) / averageVisitorsPerWindow) * 100) : 0;

        if (currentVisitors > averageVisitorsPerWindow && increasePercentage >= spikeThreshold) {
          const eventData = {
            websiteName: website.name,
            currentVisitors: currentVisitors,
            averageVisitors: averageVisitorsPerWindow,
            increase: increasePercentage,
          };

          await triggerNotification(userId, websiteId, "traffic_spike", eventData);

          logger.info("Traffic spike detected for website %s: %d visitors (avg: %d, +%d%%)", website.name, currentVisitors, averageVisitorsPerWindow, increasePercentage);
        } else {
          logger.debug("No traffic spike for website %s: %d visitors (avg: %d, +%d%%)", website.name, currentVisitors, averageVisitorsPerWindow, increasePercentage);
        }
      } catch (error) {
        logger.error("Error checking traffic spike for rule %s: %o", rule.id, error);
      }
    }

    logger.info("Finished checking for traffic spikes.");
  } catch (error) {
    logger.error("Error during traffic spike check cron job: %o", error);
  }
}

export function startCronJobs() {
  cron.schedule(
    "0 0 * * *",
    async () => {
      await finalizeDailySummaries();
      await enforceDataRetention();
      await pruneOldRawData();
      await pruneOldSummaries();
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

  cron.schedule("*/15 * * * *", checkTrafficSpikes, {
    timezone: "UTC",
  });

  logger.info("All cron jobs started successfully");
}
