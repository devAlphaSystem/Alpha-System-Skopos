import { pbAdmin, ensureAdminAuth } from "../services/pocketbase.js";
import { randomUUID } from "node:crypto";
import { subDays } from "date-fns";
import { aggregateSummaries, getReportsFromSummaries, calculatePercentageChange, calculateActiveUsers, getAllData, getMetricTrends } from "../utils/analytics.js";
import { addClient } from "../services/sseManager.js";
import logger from "../services/logger.js";

export function handleSseConnection(req, res) {
  logger.info("New SSE client connected.");
  const headers = {
    "Content-Type": "text/event-stream",
    Connection: "keep-alive",
    "Cache-Control": "no-cache",
  };
  res.writeHead(200, headers);

  addClient(res);

  res.write('data: { "type": "connected" }\n\n');
}

async function getCommonData(userId) {
  logger.debug("Fetching common data for user: %s", userId);
  await ensureAdminAuth();
  const allWebsites = await pbAdmin.collection("websites").getFullList({
    filter: `user.id = "${userId}"`,
    sort: "created",
  });

  const websites = allWebsites.filter((w) => !w.isArchived);
  const archivedWebsites = allWebsites.filter((w) => w.isArchived);
  logger.debug("Found %d active and %d archived websites for user %s.", websites.length, archivedWebsites.length, userId);

  return { websites, archivedWebsites, allWebsites };
}

async function fetchSummaries(websiteId, startDate, endDate) {
  logger.debug("Fetching summaries for website %s from %s to %s", websiteId, startDate.toISOString(), endDate.toISOString());
  await ensureAdminAuth();
  const startYear = startDate.getUTCFullYear();
  const startMonth = String(startDate.getUTCMonth() + 1).padStart(2, "0");
  const startDay = String(startDate.getUTCDate()).padStart(2, "0");
  const startDateString = `${startYear}-${startMonth}-${startDay}`;

  const endYear = endDate.getUTCFullYear();
  const endMonth = String(endDate.getUTCMonth() + 1).padStart(2, "0");
  const endDay = String(endDate.getUTCDate()).padStart(2, "0");
  const endDateString = `${endYear}-${endMonth}-${endDay}`;

  const dateFilter = `date >= "${startDateString} 00:00:00.000Z" && date <= "${endDateString} 23:59:59.999Z"`;

  const summaries = await pbAdmin.collection("dash_sum").getFullList({
    filter: `website.id = "${websiteId}" && ${dateFilter}`,
    sort: "date",
    $autoCancel: false,
  });
  logger.debug("Found %d summaries for website %s", summaries.length, websiteId);
  return summaries;
}

export async function showOverview(req, res) {
  logger.info("Rendering global overview for user: %s", res.locals.user.id);
  try {
    const { websites, archivedWebsites } = await getCommonData(res.locals.user.id);
    if (websites.length === 0 && archivedWebsites.length === 0) {
      logger.info("User %s has no websites, redirecting to websites page.", res.locals.user.id);
      return res.redirect("/websites");
    }

    const dataPeriod = 7;
    const resultsLimit = 10;
    const trendDays = 7;
    const today = new Date();

    const currentStartDate = subDays(today, dataPeriod - 1);
    const prevStartDate = subDays(currentStartDate, dataPeriod);

    logger.debug("Calculating overview data for %d active websites.", websites.length);
    const websiteIds = websites.map((w) => w.id);
    const allSummariesPromises = websiteIds.map((id) => fetchSummaries(id, prevStartDate, today));
    const summariesByWebsiteRaw = await Promise.all(allSummariesPromises);
    const allSummariesFlat = summariesByWebsiteRaw.flat();
    logger.debug("Total summaries fetched for overview: %d", allSummariesFlat.length);

    const currentSummaries = allSummariesFlat.filter((s) => new Date(s.date) >= currentStartDate);
    const prevSummaries = allSummariesFlat.filter((s) => {
      const d = new Date(s.date);
      return d >= prevStartDate && d < currentStartDate;
    });

    const activeUsersPromises = websiteIds.map((id) => calculateActiveUsers(id));
    const activeUsersCounts = await Promise.all(activeUsersPromises);
    const activeUsers = activeUsersCounts.reduce((sum, count) => sum + count, 0);

    const currentMetrics = aggregateSummaries(currentSummaries);
    const prevMetrics = aggregateSummaries(prevSummaries);
    const trends = getMetricTrends(currentSummaries, trendDays);

    const metrics = {
      ...currentMetrics,
      trends,
      change: {
        pageViews: calculatePercentageChange(currentMetrics.pageViews, prevMetrics.pageViews),
        visitors: calculatePercentageChange(currentMetrics.visitors, prevMetrics.visitors),
        engagementRate: calculatePercentageChange(currentMetrics.engagementRate, prevMetrics.engagementRate),
        avgSessionDuration: calculatePercentageChange(currentMetrics.avgSessionDuration.raw, prevMetrics.avgSessionDuration.raw),
      },
    };

    const reports = getReportsFromSummaries(currentSummaries, resultsLimit);
    logger.debug("Overview data calculated successfully. Rendering page.");

    res.render("overview", {
      websites,
      archivedWebsites,
      currentWebsite: null,
      metrics,
      reports,
      activeUsers,
      currentPage: "overview",
    });
  } catch (error) {
    logger.error("Error loading overview for user %s: %o", res.locals.user.id, error);
    res.status(500).render("500");
  }
}

export async function showDashboard(req, res) {
  const { websiteId } = req.params;
  logger.info("Rendering dashboard for website: %s, user: %s", websiteId, res.locals.user.id);
  try {
    const { websites, archivedWebsites, allWebsites } = await getCommonData(res.locals.user.id);

    const currentWebsite = allWebsites.find((w) => w.id === websiteId);
    if (!currentWebsite) {
      logger.warn("User %s attempted to access unauthorized or non-existent website %s", res.locals.user.id, websiteId);
      return res.status(404).render("404");
    }

    const dataPeriod = 7;
    const resultsLimit = 10;
    const trendDays = 7;
    const today = new Date();

    const currentStartDate = subDays(today, dataPeriod - 1);
    const prevStartDate = subDays(currentStartDate, dataPeriod);

    const allSummaries = await fetchSummaries(websiteId, prevStartDate, today);

    const currentSummaries = allSummaries.filter((s) => new Date(s.date) >= currentStartDate);
    const prevSummaries = allSummaries.filter((s) => {
      const d = new Date(s.date);
      return d >= prevStartDate && d < currentStartDate;
    });

    const activeUsers = currentWebsite.isArchived ? 0 : await calculateActiveUsers(websiteId);

    const currentMetrics = aggregateSummaries(currentSummaries);
    const prevMetrics = aggregateSummaries(prevSummaries);
    const trends = getMetricTrends(currentSummaries, trendDays);

    const metrics = {
      ...currentMetrics,
      trends,
      change: {
        pageViews: calculatePercentageChange(currentMetrics.pageViews, prevMetrics.pageViews),
        visitors: calculatePercentageChange(currentMetrics.visitors, prevMetrics.visitors),
        engagementRate: calculatePercentageChange(currentMetrics.engagementRate, prevMetrics.engagementRate),
        avgSessionDuration: calculatePercentageChange(currentMetrics.avgSessionDuration.raw, prevMetrics.avgSessionDuration.raw),
      },
    };

    if (currentWebsite.isArchived) {
      metrics.change = {};
    }

    const reports = getReportsFromSummaries(currentSummaries, resultsLimit);
    logger.debug("Dashboard data for website %s calculated successfully. Rendering page.", websiteId);

    res.render("dashboard", {
      websites,
      archivedWebsites,
      currentWebsite,
      metrics,
      reports,
      activeUsers,
      currentPage: "dashboard",
    });
  } catch (error) {
    logger.error("Error loading dashboard for website %s: %o", websiteId, error);
    res.status(500).render("500");
  }
}

export async function showWebsites(req, res) {
  logger.info("Rendering websites page for user: %s", res.locals.user.id);
  try {
    await ensureAdminAuth();
    const { websites, archivedWebsites } = await getCommonData(res.locals.user.id);
    res.render("websites", {
      websites,
      archivedWebsites,
      currentWebsite: null,
      currentPage: "websites",
    });
  } catch (error) {
    logger.error("Error fetching websites for user %s: %o", res.locals.user.id, error);
    res.status(500).render("500");
  }
}

export async function addWebsite(req, res) {
  const { name, domain, dataRetentionDays } = req.body;
  logger.info("User %s is adding a new website: %s (%s)", res.locals.user.id, name, domain);
  logger.debug("Add website payload: %o", req.body);
  try {
    await ensureAdminAuth();
    await pbAdmin.collection("websites").create({
      name,
      domain,
      dataRetentionDays: Number(dataRetentionDays) || 0,
      trackingId: randomUUID(),
      user: res.locals.user.id,
      disableLocalhostTracking: false,
      ipBlacklist: [],
      isArchived: false,
    });
    res.redirect("/websites");
  } catch (error) {
    logger.error("Error adding website %s for user %s: %o", name, res.locals.user.id, error);
    res.status(500).render("500");
  }
}

export async function archiveWebsite(req, res) {
  const { id } = req.params;
  logger.info("User %s is archiving website: %s", res.locals.user.id, id);
  try {
    await ensureAdminAuth();
    const record = await pbAdmin.collection("websites").getOne(id);
    if (record.user === res.locals.user.id) {
      await pbAdmin.collection("websites").update(id, { isArchived: true });
      logger.info("Successfully archived website: %s", id);
    } else {
      logger.warn("User %s attempted to archive unauthorized website %s", res.locals.user.id, id);
    }
    res.redirect("/websites");
  } catch (error) {
    logger.error("Error archiving website %s: %o", id, error);
    res.status(500).render("500");
  }
}

export async function restoreWebsite(req, res) {
  const { id } = req.params;
  logger.info("User %s is restoring website: %s", res.locals.user.id, id);
  try {
    await ensureAdminAuth();
    const record = await pbAdmin.collection("websites").getOne(id);
    if (record.user === res.locals.user.id) {
      await pbAdmin.collection("websites").update(id, { isArchived: false });
      logger.info("Successfully restored website: %s", id);
    } else {
      logger.warn("User %s attempted to restore unauthorized website %s", res.locals.user.id, id);
    }
    res.redirect("/websites");
  } catch (error) {
    logger.error("Error restoring website %s: %o", id, error);
    res.status(500).render("500");
  }
}

export async function deleteWebsite(req, res) {
  const { id } = req.params;
  const { deleteData } = req.body;
  logger.info("User %s is deleting website: %s. Delete data: %s", res.locals.user.id, id, deleteData);
  try {
    await ensureAdminAuth();
    const record = await pbAdmin.collection("websites").getOne(id);
    if (record.user !== res.locals.user.id) {
      logger.warn("User %s attempted to delete unauthorized website %s", res.locals.user.id, id);
      return res.status(403).send("You do not have permission to delete this website.");
    }

    if (deleteData === "true") {
      logger.info("Deleting associated data for website %s", id);
      const relatedCollections = ["dash_sum", "events", "js_errors", "sessions", "visitors"];
      for (const collection of relatedCollections) {
        let items;
        do {
          const filterField = collection === "events" || collection === "js_errors" ? "session.website.id" : "website.id";
          items = await pbAdmin.collection(collection).getFullList({
            filter: `${filterField} = "${id}"`,
            fields: "id",
            perPage: 200,
          });
          for (const item of items) {
            await pbAdmin.collection(collection).delete(item.id);
          }
          logger.debug("Deleted %d items from %s for website %s", items.length, collection, id);
        } while (items.length > 0);
      }
      logger.info("Finished deleting associated data for website %s", id);
    }

    await pbAdmin.collection("websites").delete(id);
    logger.info("Successfully deleted website: %s", id);
    res.redirect("/websites");
  } catch (error) {
    logger.error("Error deleting website %s: %o", id, error);
    res.status(500).render("500");
  }
}

export async function getOverviewData(req, res) {
  logger.debug("API call to getOverviewData initiated by user: %s", res.locals.user?.id);
  try {
    const userId = res.locals.user?.id;
    if (!userId) {
      logger.warn("Unauthorized API call to getOverviewData.");
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { websites } = await getCommonData(userId);
    if (websites.length === 0) {
      logger.debug("No active websites for user %s, returning empty data.", userId);
      return res.status(200).json({ metrics: {}, reports: {} });
    }

    const dataPeriod = Number.parseInt(req.query.period) || 7;
    const resultsLimit = Number.parseInt(req.query.limit) || 10;
    const trendDays = 7;
    const today = new Date();

    const currentStartDate = subDays(today, dataPeriod - 1);
    const prevStartDate = subDays(currentStartDate, dataPeriod);

    const websiteIds = websites.map((w) => w.id);
    const allSummariesPromises = websiteIds.map((id) => fetchSummaries(id, prevStartDate, today));
    const summariesByWebsiteRaw = await Promise.all(allSummariesPromises);
    const allSummariesFlat = summariesByWebsiteRaw.flat();

    const currentSummaries = allSummariesFlat.filter((s) => new Date(s.date) >= currentStartDate);
    const prevSummaries = allSummariesFlat.filter((s) => {
      const d = new Date(s.date);
      return d >= prevStartDate && d < currentStartDate;
    });

    const activeUsersPromises = websiteIds.map((id) => calculateActiveUsers(id));
    const activeUsersCounts = await Promise.all(activeUsersPromises);
    const activeUsers = activeUsersCounts.reduce((sum, count) => sum + count, 0);

    const currentMetrics = aggregateSummaries(currentSummaries);
    const prevMetrics = aggregateSummaries(prevSummaries);
    const trends = getMetricTrends(currentSummaries, trendDays);

    const metrics = {
      ...currentMetrics,
      trends,
      change: {
        pageViews: calculatePercentageChange(currentMetrics.pageViews, prevMetrics.pageViews),
        visitors: calculatePercentageChange(currentMetrics.visitors, prevMetrics.visitors),
        engagementRate: calculatePercentageChange(currentMetrics.engagementRate, prevMetrics.engagementRate),
        avgSessionDuration: calculatePercentageChange(currentMetrics.avgSessionDuration.raw, prevMetrics.avgSessionDuration.raw),
      },
    };

    const reports = getReportsFromSummaries(currentSummaries, resultsLimit);
    logger.debug("API getOverviewData successful for user %s.", userId);
    res.status(200).json({ activeUsers, metrics, reports });
  } catch (error) {
    logger.error("[API ERROR] Failed to fetch overview data for user %s: %o", res.locals.user?.id, error);
    res.status(500).json({ error: "Failed to fetch overview data." });
  }
}

export async function getDashboardData(req, res) {
  const { websiteId } = req.params;
  logger.debug("API call to getDashboardData for website %s by user %s", websiteId, res.locals.user?.id);
  try {
    const userId = res.locals.user?.id;

    if (!userId) {
      logger.warn("Unauthorized API call to getDashboardData for website %s.", websiteId);
      return res.status(401).json({ error: "Unauthorized" });
    }

    const website = await pbAdmin.collection("websites").getFirstListItem(`id="${websiteId}" && user.id="${userId}"`);

    const dataPeriod = Number.parseInt(req.query.period) || 7;
    const resultsLimit = Number.parseInt(req.query.limit) || 10;
    const trendDays = 7;
    const today = new Date();

    const currentStartDate = subDays(today, dataPeriod - 1);
    const prevStartDate = subDays(currentStartDate, dataPeriod);

    const allSummaries = await fetchSummaries(websiteId, prevStartDate, today);

    const currentSummaries = allSummaries.filter((s) => new Date(s.date) >= currentStartDate);
    const prevSummaries = allSummaries.filter((s) => {
      const d = new Date(s.date);
      return d >= prevStartDate && d < currentStartDate;
    });

    const activeUsers = website.isArchived ? 0 : await calculateActiveUsers(websiteId);

    const currentMetrics = aggregateSummaries(currentSummaries);
    const prevMetrics = aggregateSummaries(prevSummaries);
    const trends = getMetricTrends(currentSummaries, trendDays);

    const metrics = {
      ...currentMetrics,
      trends,
      change: {
        pageViews: calculatePercentageChange(currentMetrics.pageViews, prevMetrics.pageViews),
        visitors: calculatePercentageChange(currentMetrics.visitors, prevMetrics.visitors),
        engagementRate: calculatePercentageChange(currentMetrics.engagementRate, prevMetrics.engagementRate),
        avgSessionDuration: calculatePercentageChange(currentMetrics.avgSessionDuration.raw, prevMetrics.avgSessionDuration.raw),
      },
    };

    if (website.isArchived) {
      metrics.change = {};
    }

    const reports = getReportsFromSummaries(currentSummaries, resultsLimit);
    logger.debug("API getDashboardData successful for website %s.", websiteId);
    res.status(200).json({ activeUsers, metrics, reports });
  } catch (error) {
    logger.error("[API ERROR] Failed to fetch dashboard data for website %s: %o", req.params.websiteId, error);
    res.status(500).json({ error: "Failed to fetch dashboard data." });
  }
}

export async function getDetailedReport(req, res) {
  const { websiteId, reportType } = req.params;
  logger.debug("API call for detailed report '%s' for website %s", reportType, websiteId);
  try {
    await ensureAdminAuth();
    const userId = res.locals.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      await pbAdmin.collection("websites").getFirstListItem(`id="${websiteId}" && user.id="${userId}"`);
    } catch (error) {
      logger.warn("Forbidden access attempt for detailed report on website %s by user %s", websiteId, userId);
      return res.status(403).json({ error: "Forbidden: You do not have access to this website." });
    }

    if (reportType === "topJsErrors") {
      const allErrors = await pbAdmin.collection("js_errors").getFullList({
        filter: `website.id = "${websiteId}"`,
        sort: "-count",
      });
      const totalErrors = allErrors.reduce((sum, item) => sum + item.count, 0);
      const reportData = allErrors.map((item) => ({
        key: item.errorMessage,
        count: item.count,
        percentage: totalErrors > 0 ? Math.round((item.count / totalErrors) * 100) : 0,
        stackTrace: item.stackTrace,
      }));
      logger.debug("Found %d unique JS errors for report.", reportData.length);
      return res.status(200).json({ data: reportData });
    }

    if (reportType === "topCustomEvents") {
      const dataPeriod = Number.parseInt(req.query.period) || 7;
      const today = new Date();
      const startDate = subDays(today, dataPeriod - 1);
      const endDate = today;

      const startYear = startDate.getUTCFullYear();
      const startMonth = String(startDate.getUTCMonth() + 1).padStart(2, "0");
      const startDay = String(startDate.getUTCDate()).padStart(2, "0");
      const startDateString = `${startYear}-${startMonth}-${startDay}`;

      const endYear = endDate.getUTCFullYear();
      const endMonth = String(endDate.getUTCMonth() + 1).padStart(2, "0");
      const endDay = String(endDate.getUTCDate()).padStart(2, "0");
      const endDateString = `${endYear}-${endMonth}-${endDay}`;

      const dateFilter = `created >= "${startDateString} 00:00:00.000Z" && created <= "${endDateString} 23:59:59.999Z"`;

      const allEvents = await pbAdmin.collection("events").getFullList({
        filter: `session.website.id = "${websiteId}" && type = "custom" && ${dateFilter}`,
        fields: "eventName, eventData",
        $autoCancel: false,
      });
      logger.debug("Found %d total custom events for report.", allEvents.length);

      const eventMap = new Map();
      for (const event of allEvents) {
        if (!event.eventName) continue;
        if (!eventMap.has(event.eventName)) {
          eventMap.set(event.eventName, { count: 0, hasData: false });
        }
        const existing = eventMap.get(event.eventName);
        existing.count += 1;
        if (event.eventData && Object.keys(event.eventData).length > 0) {
          existing.hasData = true;
        }
      }

      const totalEvents = allEvents.filter((e) => e.eventName).length;
      const reportData = Array.from(eventMap.entries())
        .map(([key, value]) => ({
          key,
          count: value.count,
          percentage: totalEvents > 0 ? Math.round((value.count / totalEvents) * 100) : 0,
          hasData: value.hasData,
        }))
        .sort((a, b) => b.count - a.count);
      logger.debug("Aggregated %d unique custom events for report.", reportData.length);
      return res.status(200).json({ data: reportData });
    }

    const dataPeriod = Number.parseInt(req.query.period) || 7;
    const today = new Date();
    const currentStartDate = subDays(today, dataPeriod - 1);
    const currentEndDate = today;

    const summaries = await fetchSummaries(websiteId, currentStartDate, currentEndDate);
    const allData = getAllData(summaries, reportType);
    logger.debug("Generated report %s with %d items.", reportType, allData.length);
    res.status(200).json({ data: allData });
  } catch (error) {
    logger.error("[API ERROR] Failed to fetch detailed report for %s: %o", req.params.reportType, error);
    res.status(500).json({ error: "Failed to fetch detailed report." });
  }
}

export async function getCustomEventDetails(req, res) {
  const { websiteId } = req.params;
  const { name } = req.query;
  logger.debug("API call for custom event details for event '%s' on website %s", name, websiteId);
  try {
    await ensureAdminAuth();
    const userId = res.locals.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      await pbAdmin.collection("websites").getFirstListItem(`id="${websiteId}" && user.id="${userId}"`);
    } catch (error) {
      return res.status(403).json({ error: "Forbidden: You do not have access to this website." });
    }

    const dataPeriod = Number.parseInt(req.query.period) || 7;
    const today = new Date();
    const startDate = subDays(today, dataPeriod - 1);
    const endDate = today;

    const startYear = startDate.getUTCFullYear();
    const startMonth = String(startDate.getUTCMonth() + 1).padStart(2, "0");
    const startDay = String(startDate.getUTCDate()).padStart(2, "0");
    const startDateString = `${startYear}-${startMonth}-${startDay}`;

    const endYear = endDate.getUTCFullYear();
    const endMonth = String(endDate.getUTCMonth() + 1).padStart(2, "0");
    const endDay = String(endDate.getUTCDate()).padStart(2, "0");
    const endDateString = `${endYear}-${endMonth}-${endDay}`;

    const dateFilter = `created >= "${startDateString} 00:00:00.000Z" && created <= "${endDateString} 23:59:59.999Z"`;

    const events = await pbAdmin.collection("events").getFullList({
      filter: `session.website.id = "${websiteId}" && type = "custom" && eventName = "${name}" && eventData != null && ${dateFilter}`,
      fields: "eventData",
      $autoCancel: false,
    });
    logger.debug("Found %d events with data for event name '%s'", events.length, name);
    const uniqueEventData = [...new Set(events.map((e) => (e.eventData ? JSON.stringify(e.eventData, null, 2) : null)).filter(Boolean))];
    logger.debug("Found %d unique data payloads for event name '%s'", uniqueEventData.length, name);
    res.status(200).json({ data: uniqueEventData });
  } catch (error) {
    logger.error("[API ERROR] Failed to fetch custom event details for %s: %o", req.query.name, error);
    res.status(500).json({ error: "Failed to fetch custom event details." });
  }
}

export async function getWebsiteSettings(req, res) {
  const { websiteId } = req.params;
  logger.debug("API call to get settings for website %s", websiteId);
  try {
    await ensureAdminAuth();
    const userId = res.locals.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const website = await pbAdmin.collection("websites").getFirstListItem(`id="${websiteId}" && user.id="${userId}"`);
    res.status(200).json({ ipBlacklist: website.ipBlacklist || [] });
  } catch (error) {
    logger.error("Failed to get settings for website %s: %o", websiteId, error);
    res.status(404).json({ error: "Website not found." });
  }
}

export async function updateWebsiteSettings(req, res) {
  const { websiteId } = req.params;
  logger.info("Updating settings for website: %s", websiteId);
  logger.debug("Update settings payload: %o", req.body);
  try {
    await ensureAdminAuth();
    const userId = res.locals.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const website = await pbAdmin.collection("websites").getFirstListItem(`id="${websiteId}" && user.id="${userId}"`);

    const dataToUpdate = { ...req.body };
    if (dataToUpdate.dataRetentionDays !== undefined && dataToUpdate.dataRetentionDays !== null) {
      dataToUpdate.dataRetentionDays = Number(dataToUpdate.dataRetentionDays);
    }

    await pbAdmin.collection("websites").update(website.id, dataToUpdate);
    logger.info("Successfully updated settings for website %s", websiteId);
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error("Failed to update settings for website %s: %o", req.params.websiteId, error);
    res.status(500).json({ error: "Failed to update settings." });
  }
}

export async function addIpToBlacklist(req, res) {
  const { websiteId } = req.params;
  const { ip } = req.body;
  logger.debug("API call to add IP %s to blacklist for website %s", ip, websiteId);
  try {
    await ensureAdminAuth();
    const userId = res.locals.user?.id;
    if (!userId || !ip) return res.status(400).json({ error: "Bad Request" });

    const website = await pbAdmin.collection("websites").getFirstListItem(`id="${websiteId}" && user.id="${userId}"`);
    const currentBlacklist = website.ipBlacklist || [];
    logger.debug("Current IP blacklist size: %d", currentBlacklist.length);

    if (currentBlacklist.includes(ip)) {
      logger.warn("Attempt to add duplicate IP %s to blacklist for website %s", ip, websiteId);
      return res.status(409).json({ error: "IP already exists in blacklist." });
    }

    const newBlacklist = [...currentBlacklist, ip];
    await pbAdmin.collection("websites").update(website.id, { ipBlacklist: newBlacklist });
    logger.info("Added IP %s to blacklist for website %s", ip, websiteId);
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error("Failed to add IP to blacklist for website %s: %o", req.params.websiteId, error);
    res.status(500).json({ error: "Failed to add IP to blacklist." });
  }
}

export async function removeIpFromBlacklist(req, res) {
  const { websiteId } = req.params;
  const { ip } = req.body;
  logger.debug("API call to remove IP %s from blacklist for website %s", ip, websiteId);
  try {
    await ensureAdminAuth();
    const userId = res.locals.user?.id;
    if (!userId || !ip) return res.status(400).json({ error: "Bad Request" });

    const website = await pbAdmin.collection("websites").getFirstListItem(`id="${websiteId}" && user.id="${userId}"`);
    const currentBlacklist = website.ipBlacklist || [];
    logger.debug("Current IP blacklist size: %d", currentBlacklist.length);

    const newBlacklist = currentBlacklist.filter((i) => i !== ip);
    await pbAdmin.collection("websites").update(website.id, { ipBlacklist: newBlacklist });
    logger.info("Removed IP %s from blacklist for website %s", ip, websiteId);
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error("Failed to remove IP from blacklist for website %s: %o", req.params.websiteId, error);
    res.status(500).json({ error: "Failed to remove IP from blacklist." });
  }
}

export async function getUserIp(req, res) {
  logger.debug("API call to get user's public IP address");
  try {
    const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.headers["x-real-ip"] || req.socket.remoteAddress || req.connection.remoteAddress;

    const cleanIp = ip?.replace("::ffff:", "") || "Unknown";
    logger.debug("Detected user IP: %s", cleanIp);
    res.status(200).json({ ip: cleanIp });
  } catch (error) {
    logger.error("Failed to get user IP: %o", error);
    res.status(500).json({ error: "Failed to get user IP.", ip: "Unknown" });
  }
}

export async function showSessions(req, res) {
  const { websiteId } = req.params;
  logger.info("Rendering sessions page for website: %s, user: %s", websiteId, res.locals.user.id);
  try {
    const { websites, archivedWebsites, allWebsites } = await getCommonData(res.locals.user.id);

    const currentWebsite = allWebsites.find((w) => w.id === websiteId);
    if (!currentWebsite) {
      logger.warn("User %s attempted to access unauthorized or non-existent website %s", res.locals.user.id, websiteId);
      return res.status(404).render("404");
    }

    await ensureAdminAuth();

    const visitors = await pbAdmin.collection("visitors").getFullList({
      filter: `website.id = "${websiteId}"`,
      sort: "-created",
      $autoCancel: false,
    });

    const sessionsData = [];

    for (const visitor of visitors) {
      const sessions = await pbAdmin.collection("sessions").getFullList({
        filter: `visitor.id = "${visitor.id}"`,
        sort: "-created",
        $autoCancel: false,
      });

      for (const session of sessions) {
        const eventsCount = await pbAdmin.collection("events").getList(1, 1, {
          filter: `session.id = "${session.id}" && type = "pageView"`,
          $autoCancel: false,
        });

        const startTime = new Date(session.created);
        const endTime = new Date(session.updated);
        const durationMs = endTime - startTime;
        const durationMinutes = Math.floor(durationMs / 60000);
        const durationSeconds = Math.floor((durationMs % 60000) / 1000);

        sessionsData.push({
          sessionId: session.id,
          visitorId: visitor.visitorId,
          visitorRecordId: visitor.id,
          startTime: session.created,
          endTime: session.updated,
          duration: `${durationMinutes}m ${durationSeconds}s`,
          durationMs,
          pagesVisited: eventsCount.totalItems,
          browser: session.browser,
          os: session.os,
          device: session.device,
          country: session.country,
          isNewVisitor: session.isNewVisitor,
        });
      }
    }

    const groupedSessions = new Map();
    for (const session of sessionsData) {
      if (!groupedSessions.has(session.visitorRecordId)) {
        groupedSessions.set(session.visitorRecordId, {
          visitorId: session.visitorId,
          visitorRecordId: session.visitorRecordId,
          sessions: [],
        });
      }
      groupedSessions.get(session.visitorRecordId).sessions.push(session);
    }

    const visitorsWithSessions = Array.from(groupedSessions.values());

    logger.debug("Sessions page data for website %s calculated successfully. Rendering page.", websiteId);

    res.render("sessions", {
      websites,
      archivedWebsites,
      currentWebsite,
      visitorsWithSessions,
      currentPage: "sessions",
    });
  } catch (error) {
    logger.error("Error loading sessions page for website %s: %o", websiteId, error);
    res.status(500).render("500");
  }
}

export async function showSessionDetails(req, res) {
  const { websiteId, sessionId } = req.params;
  logger.info("Rendering session details for session: %s, website: %s, user: %s", sessionId, websiteId, res.locals.user.id);
  try {
    const { websites, archivedWebsites, allWebsites } = await getCommonData(res.locals.user.id);

    const currentWebsite = allWebsites.find((w) => w.id === websiteId);
    if (!currentWebsite) {
      logger.warn("User %s attempted to access unauthorized or non-existent website %s", res.locals.user.id, websiteId);
      return res.status(404).render("404");
    }

    await ensureAdminAuth();

    const session = await pbAdmin.collection("sessions").getOne(sessionId, {
      expand: "visitor",
      $autoCancel: false,
    });

    if (session.website !== websiteId) {
      logger.warn("Session %s does not belong to website %s", sessionId, websiteId);
      return res.status(404).render("404");
    }

    const events = await pbAdmin.collection("events").getFullList({
      filter: `session.id = "${sessionId}"`,
      sort: "created",
      $autoCancel: false,
    });

    const startTime = new Date(session.created);
    const endTime = new Date(session.updated);
    const durationMs = endTime - startTime;
    const durationMinutes = Math.floor(durationMs / 60000);
    const durationSeconds = Math.floor((durationMs % 60000) / 1000);

    const pageViews = events.filter((e) => e.type === "pageView").length;
    const customEvents = events.filter((e) => e.type === "custom").length;

    const pagesVisited = new Map();
    const customEventNames = new Map();

    for (const event of events) {
      if (event.type === "pageView") {
        pagesVisited.set(event.path, (pagesVisited.get(event.path) || 0) + 1);
      } else if (event.type === "custom" && event.eventName) {
        customEventNames.set(event.eventName, (customEventNames.get(event.eventName) || 0) + 1);
      }
    }

    const topPages = Array.from(pagesVisited.entries())
      .map(([key, count]) => ({
        key,
        count,
        percentage: pageViews > 0 ? Math.round((count / pageViews) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const topCustomEvents = Array.from(customEventNames.entries())
      .map(([key, count]) => ({
        key,
        count,
        percentage: customEvents > 0 ? Math.round((count / customEvents) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const sessionInfo = {
      sessionId: session.id,
      visitorId: session.expand?.visitor?.visitorId || "Unknown",
      visitorRecordId: session.visitor,
      startTime: session.created,
      endTime: session.updated,
      duration: `${durationMinutes}m ${durationSeconds}s`,
      durationFormatted: `${String(durationMinutes).padStart(2, "0")}:${String(durationSeconds).padStart(2, "0")}`,
      durationMs,
      browser: session.browser,
      os: session.os,
      device: session.device,
      country: session.country,
      entryPath: session.entryPath,
      exitPath: session.exitPath,
      referrer: session.referrer || "Direct",
      screenWidth: session.screenWidth,
      screenHeight: session.screenHeight,
      language: session.language,
      isNewVisitor: session.isNewVisitor,
    };

    const metrics = {
      pageViews,
      customEvents,
      duration: sessionInfo.durationFormatted,
      isNewVisitor: session.isNewVisitor,
    };

    const reports = {
      topPages,
      topCustomEvents,
    };

    logger.debug("Session details for session %s calculated successfully. Rendering page.", sessionId);

    res.render("session-details", {
      websites,
      archivedWebsites,
      currentWebsite,
      sessionInfo,
      metrics,
      reports,
      events,
      currentPage: "sessions",
    });
  } catch (error) {
    logger.error("Error loading session details for session %s: %o", sessionId, error);
    res.status(500).render("500");
  }
}

export async function deleteSession(req, res) {
  const { websiteId, sessionId } = req.params;
  logger.info("User %s is deleting session: %s from website: %s", res.locals.user.id, sessionId, websiteId);
  try {
    await ensureAdminAuth();

    const session = await pbAdmin.collection("sessions").getOne(sessionId);

    if (session.website !== websiteId) {
      logger.warn("Session %s does not belong to website %s", sessionId, websiteId);
      return res.status(403).send("You do not have permission to delete this session.");
    }

    const website = await pbAdmin.collection("websites").getOne(websiteId);
    if (website.user !== res.locals.user.id) {
      logger.warn("User %s attempted to delete session from unauthorized website %s", res.locals.user.id, websiteId);
      return res.status(403).send("You do not have permission to delete this session.");
    }

    const events = await pbAdmin.collection("events").getFullList({
      filter: `session.id = "${sessionId}"`,
      fields: "id",
      $autoCancel: false,
    });

    for (const event of events) {
      await pbAdmin.collection("events").delete(event.id);
    }

    await pbAdmin.collection("sessions").delete(sessionId);

    logger.info("Successfully deleted session: %s", sessionId);
    res.redirect(`/sessions/${websiteId}`);
  } catch (error) {
    logger.error("Error deleting session %s: %o", sessionId, error);
    res.status(500).render("500");
  }
}

export async function deleteVisitorSessions(req, res) {
  const { websiteId, visitorId } = req.params;
  logger.info("User %s is deleting all sessions for visitor: %s from website: %s", res.locals.user.id, visitorId, websiteId);
  try {
    await ensureAdminAuth();

    const visitor = await pbAdmin.collection("visitors").getOne(visitorId);

    if (visitor.website !== websiteId) {
      logger.warn("Visitor %s does not belong to website %s", visitorId, websiteId);
      return res.status(403).send("You do not have permission to delete this visitor.");
    }

    const website = await pbAdmin.collection("websites").getOne(websiteId);
    if (website.user !== res.locals.user.id) {
      logger.warn("User %s attempted to delete visitor from unauthorized website %s", res.locals.user.id, websiteId);
      return res.status(403).send("You do not have permission to delete this visitor.");
    }

    const sessions = await pbAdmin.collection("sessions").getFullList({
      filter: `visitor.id = "${visitorId}"`,
      fields: "id",
      $autoCancel: false,
    });

    for (const session of sessions) {
      const events = await pbAdmin.collection("events").getFullList({
        filter: `session.id = "${session.id}"`,
        fields: "id",
        $autoCancel: false,
      });

      for (const event of events) {
        await pbAdmin.collection("events").delete(event.id);
      }

      await pbAdmin.collection("sessions").delete(session.id);
    }

    await pbAdmin.collection("visitors").delete(visitorId);

    logger.info("Successfully deleted all sessions for visitor: %s", visitorId);
    res.redirect(`/sessions/${websiteId}`);
  } catch (error) {
    logger.error("Error deleting visitor sessions %s: %o", visitorId, error);
    res.status(500).render("500");
  }
}
