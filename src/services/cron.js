import cron from "node-cron";
import { subDays, formatISO, startOfYesterday } from "date-fns";
import { pbAdmin } from "./pocketbase.js";
import { calculateMetrics } from "../utils/analytics.js";

async function pruneOldSummaries() {
  console.log("Running cron job: Pruning old dashboard summaries...");
  try {
    const thirtyDaysAgo = subDays(new Date(), 31);
    const filterDate = thirtyDaysAgo.toISOString().split("T")[0];

    const recordsToDelete = await pbAdmin.collection("dash_sum").getFullList({
      filter: `date < "${filterDate}"`,
      fields: "id",
    });

    for (const record of recordsToDelete) {
      await pbAdmin.collection("dash_sum").delete(record.id);
    }

    console.log(`Pruned ${recordsToDelete.length} old summary records.`);
  } catch (error) {
    console.error("Error during summary pruning cron job:", error);
  }
}

async function enforceDataRetention() {
  console.log("Running cron job: Enforcing data retention policies...");
  try {
    const websites = await pbAdmin.collection("websites").getFullList({
      filter: "dataRetentionDays > 0",
    });

    for (const website of websites) {
      const retentionDays = website.dataRetentionDays;
      const cutoffDate = subDays(new Date(), retentionDays);
      const cutoffISO = cutoffDate.toISOString();
      const filter = `session.website.id = "${website.id}" && created < "${cutoffISO}"`;

      const eventsToDelete = await pbAdmin.collection("events").getFullList({
        filter: filter,
        fields: "id",
      });
      for (const event of eventsToDelete) {
        await pbAdmin.collection("events").delete(event.id);
      }

      const sessionsToDelete = await pbAdmin.collection("sessions").getFullList({
        filter: `website.id = "${website.id}" && created < "${cutoffISO}"`,
        fields: "id",
      });
      for (const session of sessionsToDelete) {
        await pbAdmin.collection("sessions").delete(session.id);
      }

      console.log(`Data retention for ${website.name}: Removed ${eventsToDelete.length} events and ${sessionsToDelete.length} sessions.`);
    }
    console.log("Finished enforcing data retention.");
  } catch (error) {
    console.error("Error during data retention cron job:", error);
  }
}

async function finalizeDailySummaries() {
  console.log("Running cron job: Finalizing yesterday's summaries...");
  try {
    const yesterday = startOfYesterday();
    const yesterdayStart = yesterday.toISOString();
    const yesterdayEnd = new Date(yesterday.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString();

    const summariesToFinalize = await pbAdmin.collection("dash_sum").getFullList({
      filter: `date >= "${yesterdayStart}" && date <= "${yesterdayEnd}" && isFinalized = false`,
    });

    for (const summary of summariesToFinalize) {
      const websiteId = summary.website;
      const dateFilter = `created >= "${yesterdayStart}" && created <= "${yesterdayEnd}"`;

      const sessions = await pbAdmin.collection("sessions").getFullList({
        filter: `website.id = "${websiteId}" && ${dateFilter}`,
      });
      const events = await pbAdmin.collection("events").getFullList({
        filter: `session.website.id = "${websiteId}" && ${dateFilter}`,
      });

      if (sessions.length > 0 || events.length > 0) {
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
        console.log(`Finalized summary for website ${websiteId}`);
      }
    }
    console.log("Finished finalizing daily summaries.");
  } catch (error) {
    console.error("Error during summary finalization cron job:", error);
  }
}

async function pruneOldSessions() {
  console.log("Running cron job: Pruning old sessions...");
  try {
    const sevenDaysAgo = subDays(new Date(), 7);
    const cutoffISO = sevenDaysAgo.toISOString();

    const recordsToDelete = await pbAdmin.collection("sessions").getFullList({
      filter: `created < "${cutoffISO}"`,
      fields: "id",
    });

    for (const record of recordsToDelete) {
      await pbAdmin.collection("sessions").delete(record.id);
    }

    console.log(`Pruned ${recordsToDelete.length} old session records.`);
  } catch (error) {
    console.error("Error during session pruning cron job:", error);
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
