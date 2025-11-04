import { pbAdmin, ensureAdminAuth } from "../services/pocketbase.js";
import { subDays } from "date-fns";
import { aggregateSummaries, getReportsFromSummaries, calculatePercentageChange, calculateActiveUsers, getMetricTrends } from "../utils/analytics.js";
import { calculateSeoScore } from "../services/seoAnalyzer.js";
import logger from "../services/logger.js";

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

    let seoInfo = null;
    try {
      const seoRecord = await pbAdmin.collection("seo_data").getFirstListItem(`website.id="${websiteId}"`);
      const seoData = {
        metaTags: seoRecord.metaTags || {},
        socialMetaTags: seoRecord.socialMetaTags || {},
        headings: seoRecord.headings || {},
        images: seoRecord.images || {},
        links: seoRecord.links || {},
        technicalSeo: seoRecord.technicalSeo || {},
        performanceScores: seoRecord.performanceScores ?? null,
        recommendations: seoRecord.recommendations ?? [],
        lastAnalyzed: seoRecord.lastAnalyzed,
      };

      const seoScore = calculateSeoScore(seoData);
      const criticalIssues = seoData.recommendations.filter((r) => r.priority === "critical").length;
      const highPriorityIssues = seoData.recommendations.filter((r) => r.priority === "high").length;

      seoInfo = {
        score: seoScore,
        criticalIssues,
        highPriorityIssues,
        totalIssues: seoData.recommendations.length,
        lastAnalyzed: seoRecord.lastAnalyzed,
        performance: seoData.performanceScores?.performance ?? null,
        hasSitemap: seoData.technicalSeo?.hasSitemap ?? false,
        hasSSL: seoData.technicalSeo?.hasSSL ?? false,
        mobileResponsive: seoData.technicalSeo?.mobileResponsive ?? false,
      };
    } catch (e) {
      logger.debug("No SEO data found for website %s", websiteId);
    }

    logger.debug("Dashboard data for website %s calculated successfully. Rendering page.", websiteId);

    res.render("dashboard", {
      websites,
      archivedWebsites,
      currentWebsite,
      metrics,
      reports,
      activeUsers,
      seoInfo,
      currentPage: "dashboard",
    });
  } catch (error) {
    logger.error("Error loading dashboard for website %s: %o", websiteId, error);
    res.status(500).render("500");
  }
}
