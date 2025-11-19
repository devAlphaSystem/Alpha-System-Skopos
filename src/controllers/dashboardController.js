import { pbAdmin, ensureAdminAuth } from "../services/pocketbase.js";
import { subDays } from "date-fns";
import { calculateMetricsFromRecords, calculatePercentageChange, calculateActiveUsers, getMetricTrends, getReportsFromMetrics } from "../services/analyticsService.js";
import logger from "../utils/logger.js";

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

async function fetchSessions(websiteId, startDate, endDate) {
  logger.debug("Fetching sessions for website %s from %s to %s", websiteId, startDate.toISOString(), endDate.toISOString());
  await ensureAdminAuth();

  const startISO = startDate.toISOString();
  const endISO = endDate.toISOString();

  const sessions = await pbAdmin.collection("sessions").getFullList({
    filter: `website.id = "${websiteId}" && created >= "${startISO}" && created <= "${endISO}"`,
    sort: "created",
    $autoCancel: false,
  });

  logger.debug("Found %d sessions for website %s", sessions.length, websiteId);
  return sessions;
}

async function fetchEvents(websiteId, startDate, endDate) {
  logger.debug("Fetching events for website %s from %s to %s", websiteId, startDate.toISOString(), endDate.toISOString());
  await ensureAdminAuth();

  const startISO = startDate.toISOString();
  const endISO = endDate.toISOString();

  const events = await pbAdmin.collection("events").getFullList({
    filter: `session.website.id = "${websiteId}" && created >= "${startISO}" && created <= "${endISO}"`,
    sort: "created",
    $autoCancel: false,
  });

  logger.debug("Found %d events for website %s", events.length, websiteId);
  return events;
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
    const resultsLimit = 10;
    const trendDays = Math.min(dataPeriod, 7);
    const today = new Date();

    const currentStartDate = subDays(today, dataPeriod - 1);
    const prevStartDate = subDays(currentStartDate, dataPeriod);
    const prevEndDate = subDays(currentStartDate, 1);

    logger.debug("Calculating overview data for %d active websites.", websites.length);
    const websiteIds = websites.map((w) => w.id);

    const currentMetricsPromises = websiteIds.map((id) => calculateMetricsFromRecords(id, currentStartDate, today));
    const prevMetricsPromises = websiteIds.map((id) => calculateMetricsFromRecords(id, prevStartDate, prevEndDate));

    const [currentMetricsArray, prevMetricsArray] = await Promise.all([Promise.all(currentMetricsPromises), Promise.all(prevMetricsPromises)]);

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

    const totalEngagedSessions = currentMetricsArray.reduce((sum, m) => Math.round((m.engagementRate / 100) * m.visitors), 0);
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
      engagementRate: 0,
      avgSessionDuration: { raw: 0 },
    };

    const prevTotalEngagedSessions = prevMetricsArray.reduce((sum, m) => Math.round((m.engagementRate / 100) * m.visitors), 0);
    prevMetrics.engagementRate = prevMetrics.visitors > 0 ? Math.round((prevTotalEngagedSessions / prevMetrics.visitors) * 100) : 0;

    let prevTotalDurationSeconds = 0;
    for (const m of prevMetricsArray) {
      prevTotalDurationSeconds += m.avgSessionDuration.raw * m.visitors;
    }
    prevMetrics.avgSessionDuration.raw = prevMetrics.visitors > 0 ? Math.round(prevTotalDurationSeconds / prevMetrics.visitors) : 0;

    const allSessionsPromises = websiteIds.map((id) => fetchSessions(id, currentStartDate, today));
    const allEventsPromises = websiteIds.map((id) => fetchEvents(id, currentStartDate, today));
    const [allSessions, allEvents] = await Promise.all([Promise.all(allSessionsPromises), Promise.all(allEventsPromises)]);

    const flatSessions = allSessions.flat();
    const flatEvents = allEvents.flat();
    const trends = getMetricTrends(flatSessions, flatEvents, trendDays);

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

    const activeUsersPromises = websiteIds.map((id) => calculateActiveUsers(id));
    const activeUsersCounts = await Promise.all(activeUsersPromises);
    const activeUsers = activeUsersCounts.reduce((sum, count) => sum + count, 0);

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

    const dataPeriod = Number.parseInt(req.query.period) || 7;
    const resultsLimit = 10;
    const trendDays = Math.min(dataPeriod, 7);
    const today = new Date();

    const currentStartDate = subDays(today, dataPeriod - 1);
    const prevStartDate = subDays(currentStartDate, dataPeriod);
    const prevEndDate = subDays(currentStartDate, 1);

    const [currentMetrics, prevMetrics] = await Promise.all([calculateMetricsFromRecords(websiteId, currentStartDate, today), calculateMetricsFromRecords(websiteId, prevStartDate, prevEndDate)]);

    const [sessions, events] = await Promise.all([fetchSessions(websiteId, currentStartDate, today), fetchEvents(websiteId, currentStartDate, today)]);

    const trends = getMetricTrends(sessions, events, trendDays);

    const activeUsers = currentWebsite.isArchived ? 0 : await calculateActiveUsers(websiteId);

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
    });
  } catch (error) {
    logger.error("Error loading dashboard for website %s: %o", websiteId, error);
    res.status(500).render("500");
  }
}
