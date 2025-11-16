import { pbAdmin, ensureAdminAuth } from "../services/pocketbase.js";
import { subDays } from "date-fns";
import { aggregateSummaries, getReportsFromSummaries, calculatePercentageChange, calculateActiveUsers, getAllData, getMetricTrends } from "../services/analyticsService.js";
import { addClient } from "../services/sseManager.js";
import logger from "../utils/logger.js";

export function handleSseConnection(req, res) {
  logger.info("New SSE client connected from user: %s", res.locals.user?.id || "unknown");
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  req.socket.setKeepAlive(true);

  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  addClient(res);

  res.write('data: {"type":"connected"}\n\n');

  const heartbeat = setInterval(() => {
    res.write(`:heartbeat ${Date.now()}\n\n`);
  }, 30000);

  req.on("close", () => {
    clearInterval(heartbeat);
    logger.info("SSE client disconnected");
  });
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
      const dataPeriod = Number.parseInt(req.query.period) || 7;
      const today = new Date();
      const startDate = subDays(today, dataPeriod - 1);
      const startDateISO = startDate.toISOString();

      const allErrors = await pbAdmin.collection("js_errors").getFullList({
        filter: `website.id = "${websiteId}" && lastSeen >= "${startDateISO}"`,
        sort: "-count",
        $autoCancel: false,
      });
      const totalErrors = allErrors.reduce((sum, item) => sum + item.count, 0);
      const reportData = allErrors.map((item) => ({
        key: item.errorMessage,
        count: item.count,
        percentage: totalErrors > 0 ? Math.round((item.count / totalErrors) * 100) : 0,
        stackTrace: item.stackTrace,
      }));

      if (reportData.length > 0) {
        logger.debug("Found %d unique JS errors for report (period: %d days).", reportData.length, dataPeriod);
        return res.status(200).json({ data: reportData });
      }

      const summaries = await fetchSummaries(websiteId, startDate, today);
      const fallbackData = getAllData(summaries, "topJsErrors").map((item) => ({
        ...item,
        stackTrace: null,
      }));
      logger.debug("No JS error records found in js_errors; falling back to summaries with %d items (period: %d days).", fallbackData.length, dataPeriod);
      return res.status(200).json({ data: fallbackData });
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

export async function getStateBreakdown(req, res) {
  const { websiteId } = req.params;
  const { country } = req.query;
  logger.debug("API call for state breakdown for country '%s' on website %s", country, websiteId);
  try {
    await ensureAdminAuth();
    const userId = res.locals.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      await pbAdmin.collection("websites").getFirstListItem(`id="${websiteId}" && user.id="${userId}"`);
    } catch (error) {
      logger.warn("Forbidden access attempt for state breakdown on website %s by user %s", websiteId, userId);
      return res.status(403).json({ error: "Forbidden: You do not have access to this website." });
    }

    const dataPeriod = Number.parseInt(req.query.period) || 7;
    const today = new Date();
    const currentStartDate = subDays(today, dataPeriod - 1);

    const startYear = currentStartDate.getUTCFullYear();
    const startMonth = String(currentStartDate.getUTCMonth() + 1).padStart(2, "0");
    const startDay = String(currentStartDate.getUTCDate()).padStart(2, "0");
    const startDateString = `${startYear}-${startMonth}-${startDay}`;

    const endYear = today.getUTCFullYear();
    const endMonth = String(today.getUTCMonth() + 1).padStart(2, "0");
    const endDay = String(today.getUTCDate()).padStart(2, "0");
    const endDateString = `${endYear}-${endMonth}-${endDay}`;

    const dateFilter = `created >= "${startDateString} 00:00:00.000Z" && created <= "${endDateString} 23:59:59.999Z"`;

    const sessions = await pbAdmin.collection("sessions").getFullList({
      filter: `website.id = "${websiteId}" && country = "${country}" && ${dateFilter}`,
      fields: "state",
      $autoCancel: false,
    });

    logger.debug("Found %d sessions for country %s", sessions.length, country);

    const stateMap = new Map();
    for (const session of sessions) {
      const state = session.state || "Unknown";
      stateMap.set(state, (stateMap.get(state) || 0) + 1);
    }

    const totalSessions = sessions.length;
    const stateData = Array.from(stateMap.entries())
      .map(([key, count]) => ({
        key,
        count,
        percentage: totalSessions > 0 ? Math.round((count / totalSessions) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    logger.debug("Found %d unique states for country %s", stateData.length, country);
    res.status(200).json({ data: stateData });
  } catch (error) {
    logger.error("[API ERROR] Failed to fetch state breakdown for country %s: %o", country, error);
    res.status(500).json({ error: "Failed to fetch state breakdown." });
  }
}
