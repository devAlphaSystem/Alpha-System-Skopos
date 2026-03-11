import { pbAdmin, ensureAdminAuth } from "../services/pocketbase.js";
import { eachDayOfInterval, subDays } from "date-fns";
import { calculateMetricsFromData, calculatePercentageChange, calculateActiveUsers, fetchRecordsForPeriod, buildSessionEventsMap } from "../services/analyticsService.js";
import { getDailyStats, getDailyStatsMulti, aggregateStats, trendsFromRows, breakdownsToReports } from "../services/rollupService.js";
import cacheService from "../services/cacheService.js";
import logger from "../utils/logger.js";

function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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

export async function showOverview(req, res) {
  logger.info("Rendering global overview for user: %s", res.locals.user.id);
  try {
    const { websites, archivedWebsites } = await getCommonData(res.locals.user.id);
    if (websites.length === 0 && archivedWebsites.length === 0) {
      logger.info("User %s has no websites, redirecting to websites page.", res.locals.user.id);
      return res.redirect("/websites");
    }

    const dataPeriod = Number.parseInt(req.query.period) || 7;
    const resultsLimit = Number.parseInt(req.query.limit) || 10;
    const trendDays = Math.min(dataPeriod, 7);
    const today = new Date();
    const todayStr = toDateString(today);

    const currentStartDate = subDays(today, dataPeriod - 1);
    currentStartDate.setHours(0, 0, 0, 0);

    const prevStartDate = subDays(currentStartDate, dataPeriod);
    const prevEndDate = new Date(currentStartDate);
    prevEndDate.setMilliseconds(-1);

    const yesterdayStr = toDateString(subDays(today, 1));
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);

    logger.debug("Calculating overview data for %d active websites.", websites.length);
    const websiteIds = websites.map((w) => w.id);

    const oldestCreated = new Date(Math.min(...websites.map((w) => new Date(w.created))));
    oldestCreated.setHours(0, 0, 0, 0);
    const clampedCurrentStart = currentStartDate < oldestCreated ? oldestCreated : currentStartDate;
    const clampedPrevStart = prevStartDate < oldestCreated ? oldestCreated : prevStartDate;

    const [pastRows, todayRawDataArray, prevRows, activeUsersCounts] = await Promise.all([getDailyStatsMulti(websiteIds, clampedCurrentStart, new Date(yesterdayStr + "T23:59:59")), Promise.all(websiteIds.map((id) => fetchRecordsForPeriod(id, todayStart, today))), clampedPrevStart <= prevEndDate ? getDailyStatsMulti(websiteIds, clampedPrevStart, prevEndDate) : Promise.resolve([]), Promise.all(websiteIds.map((id) => calculateActiveUsers(id)))]);

    const todayRows = todayRawDataArray.map((data) => {
      const sessionEventsMap = buildSessionEventsMap(data.events);
      const m = calculateMetricsFromData(data.sessions, data.events, data.jsErrors, { sessionEventsMap });
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
        breakdowns: buildTodayBreakdowns(m),
      };
    });

    const allRows = [...pastRows, ...todayRows];
    const currentMetrics = aggregateStats(allRows);
    const prevMetrics = aggregateStats(prevRows);
    const activeUsers = activeUsersCounts.reduce((sum, count) => sum + count, 0);

    const trendStartDate = trendDays < dataPeriod ? subDays(today, trendDays - 1) : currentStartDate;
    const dateRange = eachDayOfInterval({ start: trendStartDate, end: today }).map(toDateString);
    const trendRows = allRows.filter((r) => dateRange.includes(r.date));
    const trends = trendsFromRows(trendRows, dateRange);

    const metrics = {
      ...currentMetrics,
      trends,
      change: {
        pageViews: calculatePercentageChange(currentMetrics.pageViews, prevMetrics.pageViews),
        visitors: calculatePercentageChange(currentMetrics.visitors, prevMetrics.visitors),
        newVisitors: calculatePercentageChange(currentMetrics.newVisitors, prevMetrics.newVisitors),
        engagementRate: calculatePercentageChange(currentMetrics.engagementRate, prevMetrics.engagementRate),
        avgSessionDuration: calculatePercentageChange(currentMetrics.avgSessionDuration.raw, prevMetrics.avgSessionDuration.raw),
      },
    };

    const reports = breakdownsToReports(allRows, currentMetrics.pageViews, currentMetrics.visitors, currentMetrics.jsErrors, resultsLimit);
    logger.debug("Overview data calculated successfully. Rendering page.");

    res.render("overview", {
      websites,
      archivedWebsites,
      currentWebsite: null,
      metrics,
      reports,
      activeUsers,
      currentPage: "overview",
      dataPeriod,
      resultsLimit,
    });
  } catch (error) {
    logger.error("Error loading overview for user %s: %o", res.locals.user.id, error);
    res.status(500).render("500");
  }
}

export async function showCompare(req, res) {
  logger.info("Rendering compare view for user: %s", res.locals.user.id);
  try {
    const { websites, archivedWebsites } = await getCommonData(res.locals.user.id);
    const dataPeriod = Number.parseInt(req.query.period) || 7;

    res.render("compare", {
      websites,
      archivedWebsites,
      currentWebsite: null,
      currentPage: "compare",
      dataPeriod,
    });
  } catch (error) {
    logger.error("Error loading compare view for user %s: %o", res.locals.user.id, error);
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

    const dataPeriod = Number.parseInt(req.query.period) || 7;
    const resultsLimit = Number.parseInt(req.query.limit) || 10;
    const trendDays = Math.min(dataPeriod, 7);
    const today = new Date();
    const todayStr = toDateString(today);

    const currentStartDate = subDays(today, dataPeriod - 1);
    currentStartDate.setHours(0, 0, 0, 0);

    const prevStartDate = subDays(currentStartDate, dataPeriod);
    const prevEndDate = new Date(currentStartDate);
    prevEndDate.setMilliseconds(-1);

    const yesterdayStr = toDateString(subDays(today, 1));
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);

    const websiteCreated = new Date(currentWebsite.created);
    websiteCreated.setHours(0, 0, 0, 0);
    const clampedCurrentStart = currentStartDate < websiteCreated ? websiteCreated : currentStartDate;
    const clampedPrevStart = prevStartDate < websiteCreated ? websiteCreated : prevStartDate;

    const [pastRows, todayRawData, prevRows, activeUsers] = await Promise.all([getDailyStats(websiteId, clampedCurrentStart, new Date(yesterdayStr + "T23:59:59")), fetchRecordsForPeriod(websiteId, todayStart, today), clampedPrevStart <= prevEndDate ? getDailyStats(websiteId, clampedPrevStart, prevEndDate) : Promise.resolve([]), currentWebsite.isArchived ? Promise.resolve(0) : calculateActiveUsers(websiteId)]);

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
    const currentMetrics = aggregateStats(allRows);
    const prevMetrics = aggregateStats(prevRows);

    const trendStartDate = trendDays < dataPeriod ? subDays(today, trendDays - 1) : currentStartDate;
    const dateRange = eachDayOfInterval({ start: trendStartDate, end: today }).map(toDateString);
    const trendRows = allRows.filter((r) => dateRange.includes(r.date));
    const trends = trendsFromRows(trendRows, dateRange);

    const metrics = {
      ...currentMetrics,
      trends,
      change: {
        pageViews: calculatePercentageChange(currentMetrics.pageViews, prevMetrics.pageViews),
        visitors: calculatePercentageChange(currentMetrics.visitors, prevMetrics.visitors),
        newVisitors: calculatePercentageChange(currentMetrics.newVisitors, prevMetrics.newVisitors),
        engagementRate: calculatePercentageChange(currentMetrics.engagementRate, prevMetrics.engagementRate),
        avgSessionDuration: calculatePercentageChange(currentMetrics.avgSessionDuration.raw, prevMetrics.avgSessionDuration.raw),
      },
    };

    if (currentWebsite.isArchived) {
      metrics.change = {};
    }

    const reports = breakdownsToReports(allRows, currentMetrics.pageViews, currentMetrics.visitors, currentMetrics.jsErrors, resultsLimit);

    logger.debug("Dashboard data for website %s calculated successfully. Rendering page.", websiteId);

    res.render("dashboard", {
      websites,
      archivedWebsites,
      currentWebsite,
      metrics,
      reports,
      activeUsers,
      currentPage: "dashboard",
      dataPeriod,
      resultsLimit,
    });
  } catch (error) {
    logger.error("Error loading dashboard for website %s: %o", websiteId, error);
    res.status(500).render("500");
  }
}
