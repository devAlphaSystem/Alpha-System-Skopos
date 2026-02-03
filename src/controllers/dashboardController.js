import { pbAdmin, ensureAdminAuth } from "../services/pocketbase.js";
import { subDays } from "date-fns";
import { calculateMetricsFromRecords, calculatePercentageChange, calculateActiveUsers, getMetricTrends, getReportsFromMetrics } from "../services/analyticsService.js";
import cacheService from "../services/cacheService.js";
import logger from "../utils/logger.js";

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

    const currentStartDate = subDays(today, dataPeriod - 1);
    currentStartDate.setHours(0, 0, 0, 0);

    const prevStartDate = subDays(currentStartDate, dataPeriod);
    const prevEndDate = new Date(currentStartDate);
    prevEndDate.setMilliseconds(-1);

    logger.debug("Calculating overview data for %d active websites.", websites.length);
    const websiteIds = websites.map((w) => w.id);

    const [currentMetricsArray, prevMetricsArray, activeUsersCounts] = await Promise.all([Promise.all(websiteIds.map((id) => calculateMetricsFromRecords(id, currentStartDate, today))), Promise.all(websiteIds.map((id) => calculateMetricsFromRecords(id, prevStartDate, prevEndDate))), Promise.all(websiteIds.map((id) => calculateActiveUsers(id)))]);

    const activeUsers = activeUsersCounts.reduce((sum, count) => sum + count, 0);

    const allSessions = currentMetricsArray.map((m) => m._raw.sessions);
    const allEvents = currentMetricsArray.map((m) => m._raw.events);
    const allJsErrors = currentMetricsArray.map((m) => m._raw.jsErrors || []);

    const currentMetrics = {
      pageViews: currentMetricsArray.reduce((sum, m) => sum + m.pageViews, 0),
      visitors: currentMetricsArray.reduce((sum, m) => sum + m.visitors, 0),
      newVisitors: currentMetricsArray.reduce((sum, m) => sum + m.newVisitors, 0),
      returningVisitors: currentMetricsArray.reduce((sum, m) => sum + m.returningVisitors, 0),
      engagementRate: 0,
      avgSessionDuration: { formatted: "00:00", raw: 0 },
      bounceRate: 0,
      jsErrors: currentMetricsArray.reduce((sum, m) => sum + m.jsErrors, 0),
    };

    const totalEngagedSessions = currentMetricsArray.reduce((sum, m) => sum + (m.engagedSessions || 0), 0);
    currentMetrics.engagementRate = currentMetrics.visitors > 0 ? Math.round((totalEngagedSessions / currentMetrics.visitors) * 100) : 0;

    let totalDurationSeconds = 0;
    for (const m of currentMetricsArray) {
      totalDurationSeconds += m.avgSessionDuration.raw * m.visitors;
    }
    const avgDuration = currentMetrics.visitors > 0 ? Math.round(totalDurationSeconds / currentMetrics.visitors) : 0;
    const minutes = Math.floor(avgDuration / 60)
      .toString()
      .padStart(2, "0");
    const seconds = (avgDuration % 60).toString().padStart(2, "0");
    currentMetrics.avgSessionDuration = { formatted: `${minutes}:${seconds}`, raw: avgDuration };

    const prevMetrics = {
      pageViews: prevMetricsArray.reduce((sum, m) => sum + m.pageViews, 0),
      visitors: prevMetricsArray.reduce((sum, m) => sum + m.visitors, 0),
      newVisitors: prevMetricsArray.reduce((sum, m) => sum + m.newVisitors, 0),
      engagementRate: 0,
      avgSessionDuration: { raw: 0 },
    };

    const prevTotalEngagedSessions = prevMetricsArray.reduce((sum, m) => sum + (m.engagedSessions || 0), 0);
    prevMetrics.engagementRate = prevMetrics.visitors > 0 ? Math.round((prevTotalEngagedSessions / prevMetrics.visitors) * 100) : 0;

    let prevTotalDurationSeconds = 0;
    for (const m of prevMetricsArray) {
      prevTotalDurationSeconds += m.avgSessionDuration.raw * m.visitors;
    }
    prevMetrics.avgSessionDuration.raw = prevMetrics.visitors > 0 ? Math.round(prevTotalDurationSeconds / prevMetrics.visitors) : 0;

    const flatSessions = allSessions.flat();
    const flatEvents = allEvents.flat();
    const flatJsErrors = allJsErrors.flat();
    const trends = getMetricTrends(flatSessions, flatEvents, flatJsErrors, trendDays);

    const mergedMetrics = {
      topPages: new Map(),
      entryPages: new Map(),
      exitPages: new Map(),
      topReferrers: new Map(),
      deviceBreakdown: new Map(),
      browserBreakdown: new Map(),
      languageBreakdown: new Map(),
      countryBreakdown: new Map(),
      stateBreakdown: new Map(),
      topCustomEvents: new Map(),
      topJsErrors: new Map(),
    };

    for (const m of currentMetricsArray) {
      for (const item of m.topPages) mergedMetrics.topPages.set(item.key, (mergedMetrics.topPages.get(item.key) || 0) + item.count);
      for (const item of m.entryPages) mergedMetrics.entryPages.set(item.key, (mergedMetrics.entryPages.get(item.key) || 0) + item.count);
      for (const item of m.exitPages) mergedMetrics.exitPages.set(item.key, (mergedMetrics.exitPages.get(item.key) || 0) + item.count);
      for (const item of m.topReferrers) mergedMetrics.topReferrers.set(item.key, (mergedMetrics.topReferrers.get(item.key) || 0) + item.count);
      for (const item of m.deviceBreakdown) mergedMetrics.deviceBreakdown.set(item.key, (mergedMetrics.deviceBreakdown.get(item.key) || 0) + item.count);
      for (const item of m.browserBreakdown) mergedMetrics.browserBreakdown.set(item.key, (mergedMetrics.browserBreakdown.get(item.key) || 0) + item.count);
      for (const item of m.languageBreakdown) mergedMetrics.languageBreakdown.set(item.key, (mergedMetrics.languageBreakdown.get(item.key) || 0) + item.count);
      for (const item of m.countryBreakdown) mergedMetrics.countryBreakdown.set(item.key, (mergedMetrics.countryBreakdown.get(item.key) || 0) + item.count);
      for (const item of m.stateBreakdown) mergedMetrics.stateBreakdown.set(item.key, (mergedMetrics.stateBreakdown.get(item.key) || 0) + item.count);
      for (const item of m.topCustomEvents) mergedMetrics.topCustomEvents.set(item.key, (mergedMetrics.topCustomEvents.get(item.key) || 0) + item.count);
      for (const item of m.topJsErrors) mergedMetrics.topJsErrors.set(item.key, (mergedMetrics.topJsErrors.get(item.key) || 0) + item.count);
    }

    const sortedMetrics = {
      topPages: Array.from(mergedMetrics.topPages.entries())
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count),
      entryPages: Array.from(mergedMetrics.entryPages.entries())
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count),
      exitPages: Array.from(mergedMetrics.exitPages.entries())
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count),
      topReferrers: Array.from(mergedMetrics.topReferrers.entries())
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count),
      deviceBreakdown: Array.from(mergedMetrics.deviceBreakdown.entries())
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count),
      browserBreakdown: Array.from(mergedMetrics.browserBreakdown.entries())
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count),
      languageBreakdown: Array.from(mergedMetrics.languageBreakdown.entries())
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count),
      countryBreakdown: Array.from(mergedMetrics.countryBreakdown.entries())
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count),
      stateBreakdown: Array.from(mergedMetrics.stateBreakdown.entries())
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count),
      topCustomEvents: Array.from(mergedMetrics.topCustomEvents.entries())
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count),
      topJsErrors: Array.from(mergedMetrics.topJsErrors.entries())
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count),
    };

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

    const reports = getReportsFromMetrics(sortedMetrics, resultsLimit);
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

    const currentStartDate = subDays(today, dataPeriod - 1);
    currentStartDate.setHours(0, 0, 0, 0);

    const prevStartDate = subDays(currentStartDate, dataPeriod);
    const prevEndDate = new Date(currentStartDate);
    prevEndDate.setMilliseconds(-1);

    const [currentMetrics, prevMetrics, activeUsers] = await Promise.all([calculateMetricsFromRecords(websiteId, currentStartDate, today), calculateMetricsFromRecords(websiteId, prevStartDate, prevEndDate), currentWebsite.isArchived ? Promise.resolve(0) : calculateActiveUsers(websiteId)]);

    const { sessions, events, jsErrors } = currentMetrics._raw;
    const trends = getMetricTrends(sessions, events, jsErrors, trendDays);

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

    const reports = getReportsFromMetrics(currentMetrics, resultsLimit);

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
