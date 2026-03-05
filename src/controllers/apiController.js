import { pbAdmin, ensureAdminAuth } from "../services/pocketbase.js";
import { eachDayOfInterval, subDays } from "date-fns";
import { calculateMetricsFromData, calculatePercentageChange, calculateActiveUsers, fetchRecordsForPeriod, buildSessionEventsMap } from "../services/analyticsService.js";
import { getDailyStats, getDailyStatsMulti, aggregateStats, trendsFromRows, breakdownsToReports, breakdownsToAllData } from "../services/rollupService.js";
import { addClient } from "../services/sseManager.js";
import cacheService from "../services/cacheService.js";
import logger from "../utils/logger.js";
import { get as nlcurlGet } from "nlcurl";

function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

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
  const cacheKey = cacheService.key("websites", userId);

  return cacheService.getOrCompute(cacheKey, cacheService.TTL.WEBSITES, async () => {
    logger.debug("Fetching common data for user: %s", userId);
    await ensureAdminAuth();
    const allWebsites = await pbAdmin.collection("websites").getFullList({
      filter: `user.id = "${userId}"`,
      sort: "created",
      fields: "id,domain,name,trackingId,isArchived,created,disableLocalhostTracking,dataRetentionDays,uptimeMonitoring,uptimeCheckInterval",
    });

    const websites = allWebsites.filter((w) => !w.isArchived);
    const archivedWebsites = allWebsites.filter((w) => w.isArchived);
    logger.debug("Found %d active and %d archived websites for user %s.", websites.length, archivedWebsites.length, userId);

    return { websites, archivedWebsites, allWebsites };
  });
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
    const requestedSections = req.query.sections ? req.query.sections.split(",") : null;
    const sectionsKey = requestedSections ? requestedSections.sort().join(",") : "all";
    const responseCacheKey = cacheService.key("overviewResponse", userId, dataPeriod, resultsLimit, sectionsKey);

    const response = await cacheService.getOrCompute(responseCacheKey, cacheService.TTL.SESSIONS, async () => {
      const wantReports = !requestedSections || requestedSections.includes("reports");
      const wantTrends = !requestedSections || requestedSections.includes("trends");
      const wantChange = !requestedSections || requestedSections.includes("change");
      const wantActiveUsers = !requestedSections || requestedSections.includes("activeUsers");
      const today = new Date();
      const todayStr = toDateString(today);

      const currentStartDate = subDays(today, dataPeriod - 1);
      currentStartDate.setHours(0, 0, 0, 0);
      const yesterdayStr = toDateString(subDays(today, 1));
      const todayStart = new Date(today);
      todayStart.setHours(0, 0, 0, 0);

      const websiteIds = websites.map((w) => w.id);

      const fetches = [getDailyStatsMulti(websiteIds, currentStartDate, new Date(yesterdayStr + "T23:59:59")), Promise.all(websiteIds.map((id) => fetchRecordsForPeriod(id, todayStart, today)))];
      if (wantChange) {
        const prevStartDate = subDays(currentStartDate, dataPeriod);
        const prevEndDate = new Date(currentStartDate);
        prevEndDate.setMilliseconds(-1);
        fetches.push(getDailyStatsMulti(websiteIds, prevStartDate, prevEndDate));
      }
      if (wantActiveUsers) fetches.push(Promise.all(websiteIds.map((id) => calculateActiveUsers(id))));

      const fetchResults = await Promise.all(fetches);
      const pastRows = fetchResults[0];
      const todayRawDataArray = fetchResults[1];
      const prevRows = wantChange ? fetchResults[2] : [];
      const activeUsersCounts = wantActiveUsers ? fetchResults[wantChange ? 3 : 2] : null;

      const todayRows = todayRawDataArray.map((data) => {
        const sessionEventsMap = buildSessionEventsMap(data.events);
        const m = calculateMetricsFromData(data.sessions, data.events, data.jsErrors, { skipBreakdowns: !wantReports, sessionEventsMap });
        let todayDurationMs = 0;
        for (const s of data.sessions) {
          const dur = new Date(s.updated) - new Date(s.created);
          if (dur > 0) todayDurationMs += dur;
        }
        return {
          date: todayStr,
          visitors: m.visitors,
          newVisitors: m.newVisitors,
          pageViews: m.pageViews,
          engagedSessions: m.engagedSessions,
          bounceCount: m.visitors > 0 ? Math.round((m.bounceRate / 100) * m.visitors) : 0,
          totalDurationMs: todayDurationMs,
          jsErrorCount: m.jsErrors,
          breakdowns: wantReports ? buildTodayBreakdowns(m) : null,
        };
      });

      const allRows = [...pastRows, ...todayRows];
      const currentMetrics = aggregateStats(allRows);
      const activeUsers = activeUsersCounts ? activeUsersCounts.reduce((sum, count) => sum + count, 0) : 0;

      const metrics = { ...currentMetrics };

      if (wantTrends) {
        const trendDays = Math.min(dataPeriod, 7);
        const trendStartDate = trendDays < dataPeriod ? subDays(today, trendDays - 1) : currentStartDate;
        const dateRange = eachDayOfInterval({ start: trendStartDate, end: today }).map(toDateString);
        const trendRows = allRows.filter((r) => dateRange.includes(r.date));
        metrics.trends = trendsFromRows(trendRows, dateRange);
      }

      if (wantChange) {
        const prevMetrics = aggregateStats(prevRows);
        metrics.change = {
          pageViews: calculatePercentageChange(currentMetrics.pageViews, prevMetrics.pageViews),
          visitors: calculatePercentageChange(currentMetrics.visitors, prevMetrics.visitors),
          newVisitors: calculatePercentageChange(currentMetrics.newVisitors, prevMetrics.newVisitors),
          engagementRate: calculatePercentageChange(currentMetrics.engagementRate, prevMetrics.engagementRate),
          avgSessionDuration: calculatePercentageChange(currentMetrics.avgSessionDuration.raw, prevMetrics.avgSessionDuration.raw),
          bounceRate: calculatePercentageChange(currentMetrics.bounceRate, prevMetrics.bounceRate),
        };
      }

      const response = { metrics };
      if (wantActiveUsers) response.activeUsers = activeUsers;

      if (wantReports) {
        response.reports = breakdownsToReports(allRows, currentMetrics.pageViews, currentMetrics.visitors, currentMetrics.jsErrors, resultsLimit);
      }

      return response;
    });

    logger.debug("API getOverviewData successful for user %s.", userId);
    res.status(200).json(response);
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
    const requestedSections = req.query.sections ? req.query.sections.split(",") : null;
    const sectionsKey = requestedSections ? requestedSections.sort().join(",") : "all";
    const responseCacheKey = cacheService.key("dashResponse", websiteId, dataPeriod, resultsLimit, sectionsKey);

    const response = await cacheService.getOrCompute(responseCacheKey, cacheService.TTL.SESSIONS, async () => {
      const wantReports = !requestedSections || requestedSections.includes("reports");
      const wantTrends = !requestedSections || requestedSections.includes("trends");
      const wantChange = !requestedSections || requestedSections.includes("change");
      const wantActiveUsers = !requestedSections || requestedSections.includes("activeUsers");
      const today = new Date();
      const todayStr = toDateString(today);

      const currentStartDate = subDays(today, dataPeriod - 1);
      currentStartDate.setHours(0, 0, 0, 0);

      const todayStart = new Date(today);
      todayStart.setHours(0, 0, 0, 0);
      const yesterdayStr = toDateString(subDays(today, 1));

      const pastFetches = [getDailyStats(websiteId, currentStartDate, new Date(yesterdayStr + "T23:59:59")), fetchRecordsForPeriod(websiteId, todayStart, today)];
      if (wantChange) {
        const prevStartDate = subDays(currentStartDate, dataPeriod);
        const prevEndDate = new Date(currentStartDate);
        prevEndDate.setMilliseconds(-1);
        pastFetches.push(getDailyStats(websiteId, prevStartDate, prevEndDate));
      }

      const fetchResults = await Promise.all(pastFetches);
      const pastRows = fetchResults[0];
      const todayRawData = fetchResults[1];

      const sessionEventsMap = buildSessionEventsMap(todayRawData.events);
      const todayMetrics = calculateMetricsFromData(todayRawData.sessions, todayRawData.events, todayRawData.jsErrors, { skipBreakdowns: !wantReports, sessionEventsMap });

      let todayDurationMs = 0;
      for (const s of todayRawData.sessions) {
        const dur = new Date(s.updated) - new Date(s.created);
        if (dur > 0) todayDurationMs += dur;
      }
      const todayRow = {
        date: todayStr,
        visitors: todayMetrics.visitors,
        newVisitors: todayMetrics.newVisitors,
        pageViews: todayMetrics.pageViews,
        engagedSessions: todayMetrics.engagedSessions,
        bounceCount: todayMetrics.visitors > 0 ? Math.round((todayMetrics.bounceRate / 100) * todayMetrics.visitors) : 0,
        totalDurationMs: todayDurationMs,
        jsErrorCount: todayMetrics.jsErrors,
        breakdowns: wantReports ? buildTodayBreakdowns(todayMetrics) : null,
      };

      const allRows = [...pastRows, todayRow];
      const currentMetrics = aggregateStats(allRows);

      const response = {};

      if (wantActiveUsers) {
        response.activeUsers = website.isArchived ? 0 : await calculateActiveUsers(websiteId);
      }

      const metrics = { ...currentMetrics };

      if (wantTrends) {
        const trendDays = Math.min(dataPeriod, 7);
        const trendStartDate = trendDays < dataPeriod ? subDays(today, trendDays - 1) : currentStartDate;
        const dateRange = eachDayOfInterval({ start: trendStartDate, end: today }).map(toDateString);
        const trendRows = allRows.filter((r) => dateRange.includes(r.date));
        metrics.trends = trendsFromRows(trendRows, dateRange);
      }

      if (wantChange) {
        const prevRows = fetchResults[2];
        const prevMetrics = aggregateStats(prevRows);
        metrics.change = {
          pageViews: calculatePercentageChange(currentMetrics.pageViews, prevMetrics.pageViews),
          visitors: calculatePercentageChange(currentMetrics.visitors, prevMetrics.visitors),
          newVisitors: calculatePercentageChange(currentMetrics.newVisitors, prevMetrics.newVisitors),
          engagementRate: calculatePercentageChange(currentMetrics.engagementRate, prevMetrics.engagementRate),
          avgSessionDuration: calculatePercentageChange(currentMetrics.avgSessionDuration.raw, prevMetrics.avgSessionDuration.raw),
          bounceRate: calculatePercentageChange(currentMetrics.bounceRate, prevMetrics.bounceRate),
        };
        if (website.isArchived) {
          metrics.change = {};
        }
      }

      response.metrics = metrics;

      if (wantReports) {
        response.reports = breakdownsToReports(allRows, currentMetrics.pageViews, currentMetrics.visitors, currentMetrics.jsErrors, resultsLimit);
      }

      return response;
    });

    logger.debug("API getDashboardData successful for website %s.", websiteId);
    res.status(200).json(response);
  } catch (error) {
    logger.error("[API ERROR] Failed to fetch dashboard data for website %s: %o", req.params.websiteId, error);
    res.status(500).json({ error: "Failed to fetch dashboard data." });
  }
}

function buildTodayBreakdowns(metrics) {
  const bd = {};
  const keys = ["topPages", "entryPages", "exitPages", "topReferrers", "deviceBreakdown", "browserBreakdown", "languageBreakdown", "countryBreakdown", "stateBreakdown", "topCustomEvents", "topJsErrors"];
  for (const key of keys) {
    const arr = metrics[key];
    if (!arr) {
      bd[key] = {};
      continue;
    }
    const obj = {};
    for (const item of arr) {
      obj[item.key] = item.count;
    }
    bd[key] = obj;
  }
  return bd;
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
      startDate.setHours(0, 0, 0, 0);
      const startDateISO = startDate.toISOString().replace("T", " ");

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
        breadcrumbs: item.breadcrumbs || [],
      }));

      logger.debug("Found %d unique JS errors for report (period: %d days).", reportData.length, dataPeriod);
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
    currentStartDate.setHours(0, 0, 0, 0);
    const todayStr = toDateString(today);
    const yesterdayStr = toDateString(subDays(today, 1));
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);

    const [pastRows, todayRawData] = await Promise.all([getDailyStats(websiteId, currentStartDate, new Date(yesterdayStr + "T23:59:59")), fetchRecordsForPeriod(websiteId, todayStart, today)]);

    const sessionEventsMap = buildSessionEventsMap(todayRawData.events);
    const todayMetrics = calculateMetricsFromData(todayRawData.sessions, todayRawData.events, todayRawData.jsErrors, { sessionEventsMap });
    let todayDurationMs = 0;
    for (const s of todayRawData.sessions) {
      const dur = new Date(s.updated) - new Date(s.created);
      if (dur > 0) todayDurationMs += dur;
    }
    const todayRow = {
      date: todayStr,
      visitors: todayMetrics.visitors,
      newVisitors: todayMetrics.newVisitors,
      pageViews: todayMetrics.pageViews,
      engagedSessions: todayMetrics.engagedSessions,
      bounceCount: todayMetrics.visitors > 0 ? Math.round((todayMetrics.bounceRate / 100) * todayMetrics.visitors) : 0,
      totalDurationMs: todayDurationMs,
      jsErrorCount: todayMetrics.jsErrors,
      breakdowns: buildTodayBreakdowns(todayMetrics),
    };

    const allRows = [...pastRows, todayRow];
    const stats = aggregateStats(allRows);
    const allData = breakdownsToAllData(allRows, stats.pageViews, stats.visitors, stats.jsErrors, reportType);
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

export async function proxyImage(req, res) {
  const { url } = req.query;
  if (!url) {
    return res.status(400).send("URL parameter is required");
  }

  try {
    const decodedUrl = decodeURIComponent(url);
    if (!decodedUrl.startsWith("http")) {
      return res.status(400).send("Invalid URL");
    }

    logger.debug("Proxying image: %s", decodedUrl);

    const response = await nlcurlGet(decodedUrl, {
      headers: {
        "User-Agent": "Skopos-Ad-Proxy/1.0",
      },
      timeout: 10000,
      stream: true,
    });

    if (!response.ok) {
      logger.error("Proxy fetch failed for %s: %s %s", decodedUrl, response.status, response.statusText);
      return res.status(response.status).send(response.statusText);
    }

    const contentType = response.headers["content-type"];
    if (contentType) res.setHeader("Content-Type", contentType);

    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

    if (response.body) {
      response.body.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    logger.error("Error proxying image %s: %o", url, error);
    if (!res.headersSent) {
      res.status(500).send("Internal Server Error");
    }
  }
}
