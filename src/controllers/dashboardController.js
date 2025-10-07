import { pb } from "../services/pocketbase.js";
import { randomUUID } from "node:crypto";
import { startOfDay, endOfDay, subDays, formatISO } from "date-fns";
import { calculateMetrics, getReports, generateTimeseries, calculatePercentageChange, calculateActiveUsers, getAllData } from "../utils/analytics.js";

async function getCommonData(userId) {
  const websites = await pb.collection("websites").getFullList({
    filter: `user.id = "${userId}"`,
    sort: "created",
  });
  return { websites };
}

async function fetchAnalyticsData(websiteId, startDate, endDate) {
  const start = formatISO(startOfDay(startDate));
  const end = formatISO(endOfDay(endDate));
  const dateFilter = `created >= "${start}" && created <= "${end}"`;

  const sessions = await pb.collection("sessions").getFullList({
    filter: `website.id = "${websiteId}" && ${dateFilter}`,
    $autoCancel: false,
  });

  const events = await pb.collection("events").getFullList({
    filter: `session.website.id = "${websiteId}" && ${dateFilter}`,
    $autoCancel: false,
  });

  return { sessions, events };
}

export async function showIndex(req, res) {
  const { websites } = await getCommonData(res.locals.user.id);
  if (websites.length > 0) {
    res.redirect(`/dashboard/${websites[0].id}`);
  } else {
    res.redirect("/websites");
  }
}

export async function showDashboard(req, res) {
  try {
    const { websiteId } = req.params;
    const { websites } = await getCommonData(res.locals.user.id);

    const currentWebsite = websites.find((w) => w.id === websiteId);
    if (!currentWebsite) {
      return res.status(404).send("Website not found or you do not have permission to view it.");
    }

    const dataPeriod = 7;
    const resultsLimit = 10;

    const today = new Date();
    const currentStartDate = subDays(today, dataPeriod - 1);
    const currentEndDate = today;

    const periodLength = dataPeriod;
    const prevStartDate = subDays(currentStartDate, periodLength);
    const prevEndDate = subDays(currentEndDate, periodLength);

    const currentData = await fetchAnalyticsData(websiteId, currentStartDate, currentEndDate);
    const prevData = await fetchAnalyticsData(websiteId, prevStartDate, prevEndDate);
    const activeUsers = await calculateActiveUsers(websiteId);

    const currentMetrics = calculateMetrics(currentData.sessions, currentData.events);
    const prevMetrics = calculateMetrics(prevData.sessions, prevData.events);

    const metrics = {
      ...currentMetrics,
      change: {
        pageViews: calculatePercentageChange(currentMetrics.pageViews, prevMetrics.pageViews),
        visitors: calculatePercentageChange(currentMetrics.visitors, prevMetrics.visitors),
        bounceRate: calculatePercentageChange(currentMetrics.bounceRate, prevMetrics.bounceRate, true),
        avgSessionDuration: calculatePercentageChange(currentMetrics.avgSessionDuration.raw, prevMetrics.avgSessionDuration.raw),
      },
    };

    const reportLimits = {
      topPages: resultsLimit,
      topReferrers: resultsLimit,
      deviceBreakdown: resultsLimit,
      browserBreakdown: resultsLimit,
      languageBreakdown: resultsLimit,
      utmSourceBreakdown: resultsLimit,
      utmMediumBreakdown: resultsLimit,
      utmCampaignBreakdown: resultsLimit,
      topCustomEvents: resultsLimit,
    };

    const reports = getReports(currentData.sessions, currentData.events, reportLimits);
    const chartData = generateTimeseries(currentData.events, currentStartDate, currentEndDate);

    res.render("dashboard", {
      websites,
      currentWebsite,
      metrics,
      reports,
      activeUsers,
      chartData: JSON.stringify(chartData),
      currentPage: "dashboard",
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error loading dashboard.");
  }
}

export async function showWebsites(req, res) {
  try {
    const { websites } = await getCommonData(res.locals.user.id);
    res.render("websites", { websites, currentWebsite: null, currentPage: "websites" });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error fetching websites.");
  }
}

export async function addWebsite(req, res) {
  const { name, domain, dataRetentionDays } = req.body;
  try {
    const newSite = await pb.collection("websites").create({
      name,
      domain,
      dataRetentionDays: Number(dataRetentionDays) || 0,
      trackingId: randomUUID(),
      user: res.locals.user.id,
    });
    res.redirect(`/dashboard/${newSite.id}`);
  } catch (error) {
    console.error("Error adding website:", error);
    res.status(500).send("Failed to add website.");
  }
}

export async function deleteWebsite(req, res) {
  const { id } = req.params;
  try {
    const record = await pb.collection("websites").getOne(id);
    if (record.user === res.locals.user.id) {
      await pb.collection("websites").delete(id);
    }
    res.redirect("/websites");
  } catch (error) {
    console.error("Error deleting website:", error);
    res.status(500).send("Failed to delete website.");
  }
}

export async function getDashboardData(req, res) {
  try {
    const { websiteId } = req.params;
    const userId = res.locals.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      await pb.collection("websites").getFirstListItem(`id="${websiteId}" && user.id="${userId}"`);
    } catch (error) {
      return res.status(403).json({ error: "Forbidden: You do not have access to this website." });
    }

    const dataPeriod = Number.parseInt(req.query.period) || 7;
    const resultsLimit = Number.parseInt(req.query.limit) || 10;

    const today = new Date();
    const currentStartDate = subDays(today, dataPeriod - 1);
    const currentEndDate = today;

    const periodLength = dataPeriod;
    const prevStartDate = subDays(currentStartDate, periodLength);
    const prevEndDate = subDays(currentEndDate, periodLength);

    const [currentData, prevData, activeUsers] = await Promise.all([fetchAnalyticsData(websiteId, currentStartDate, currentEndDate), fetchAnalyticsData(websiteId, prevStartDate, prevEndDate), calculateActiveUsers(websiteId)]);

    const currentMetrics = calculateMetrics(currentData.sessions, currentData.events);
    const prevMetrics = calculateMetrics(prevData.sessions, prevData.events);

    const metrics = {
      ...currentMetrics,
      change: {
        pageViews: calculatePercentageChange(currentMetrics.pageViews, prevMetrics.pageViews),
        visitors: calculatePercentageChange(currentMetrics.visitors, prevMetrics.visitors),
        bounceRate: calculatePercentageChange(currentMetrics.bounceRate, prevMetrics.bounceRate, true),
        avgSessionDuration: calculatePercentageChange(currentMetrics.avgSessionDuration.raw, prevMetrics.avgSessionDuration.raw),
      },
    };

    const reportLimits = {
      topPages: resultsLimit,
      topReferrers: resultsLimit,
      deviceBreakdown: resultsLimit,
      browserBreakdown: resultsLimit,
      languageBreakdown: resultsLimit,
      utmSourceBreakdown: resultsLimit,
      utmMediumBreakdown: resultsLimit,
      utmCampaignBreakdown: resultsLimit,
      topCustomEvents: resultsLimit,
    };

    const reports = getReports(currentData.sessions, currentData.events, reportLimits);
    const chartData = generateTimeseries(currentData.events, currentStartDate, currentEndDate);

    const updateData = {
      activeUsers,
      metrics,
      reports,
      chartData,
    };

    res.status(200).json(updateData);
  } catch (error) {
    console.error("[API ERROR] Failed to fetch dashboard data:", error);
    res.status(500).json({ error: "Failed to fetch dashboard data." });
  }
}

export async function getDetailedReport(req, res) {
  try {
    const { websiteId, reportType } = req.params;
    const userId = res.locals.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      await pb.collection("websites").getFirstListItem(`id="${websiteId}" && user.id="${userId}"`);
    } catch (error) {
      return res.status(403).json({ error: "Forbidden: You do not have access to this website." });
    }

    const dataPeriod = Number.parseInt(req.query.period) || 7;
    const today = new Date();
    const currentStartDate = subDays(today, dataPeriod - 1);
    const currentEndDate = today;

    const currentData = await fetchAnalyticsData(websiteId, currentStartDate, currentEndDate);
    const allData = getAllData(currentData.sessions, currentData.events, reportType);

    res.status(200).json({ data: allData });
  } catch (error) {
    console.error("[API ERROR] Failed to fetch detailed report:", error);
    res.status(500).json({ error: "Failed to fetch detailed report." });
  }
}
