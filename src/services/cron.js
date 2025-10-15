import cron from "node-cron";
import { subDays, startOfYesterday } from "date-fns";
import { pbAdmin, ensureAdminAuth } from "./pocketbase.js";
import { calculateMetrics } from "../utils/analytics.js";
import logger from "./logger.js";

async function pruneOldSummaries() {
  logger.info("Running cron job: Pruning old dashboard summaries...");
  try {
    await ensureAdminAuth();
    const thirtyDaysAgo = subDays(new Date(), 31);
    const filterDate = thirtyDaysAgo.toISOString().split("T")[0];
    logger.debug("Pruning summaries older than %s", filterDate);

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

async function pruneOldSessions() {
  logger.info("Running cron job: Pruning old sessions...");
  try {
    await ensureAdminAuth();
    const sevenDaysAgo = subDays(new Date(), 7);
    const cutoffISO = sevenDaysAgo.toISOString();
    logger.debug("Pruning sessions older than %s", cutoffISO);

    const recordsToDelete = await pbAdmin.collection("sessions").getFullList({
      filter: `created < "${cutoffISO}"`,
      fields: "id",
    });

    if (recordsToDelete.length > 0) {
      logger.debug("Found %d old session records to prune.", recordsToDelete.length);
      for (const record of recordsToDelete) {
        await pbAdmin.collection("sessions").delete(record.id);
      }
    }

    logger.info(`Pruned ${recordsToDelete.length} old session records.`);
  } catch (error) {
    logger.error("Error during session pruning cron job: %o", error);
  }
}

export function startCronJobs() {
  cron.schedule("0 0 * * *", pruneOldSummaries, {
    timezone: "UTC",
  });

  cron.schedule("0 1 * * *", enforceDataRetention, {
    timezone: "UTC",
  });

  cron.schedule("5 0 * * *", finalizeDailySummaries, {
    timezone: "UTC",
  });

  cron.schedule("0 2 * * *", pruneOldSessions, {
    timezone: "UTC",
  });
}
