import { pbAdmin, ensureAdminAuth } from "../services/pocketbase.js";
import { randomUUID } from "node:crypto";
import { subDays } from "date-fns";
import { aggregateSummaries, getReportsFromSummaries, calculatePercentageChange, calculateActiveUsers, getAllData, getMetricTrends } from "../utils/analytics.js";
import { addClient } from "../services/sseManager.js";

export function handleSseConnection(res) {
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
  await ensureAdminAuth();
  const allWebsites = await pbAdmin.collection("websites").getFullList({
    filter: `user.id = "${userId}"`,
    sort: "created",
  });

  const websites = allWebsites.filter((w) => !w.isArchived);
  const archivedWebsites = allWebsites.filter((w) => w.isArchived);

  return { websites, archivedWebsites, allWebsites };
}

async function fetchSummaries(websiteId, startDate, endDate) {
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
  return summaries;
}

export async function showOverview(res) {
  try {
    const { websites, archivedWebsites } = await getCommonData(res.locals.user.id);
    if (websites.length === 0 && archivedWebsites.length === 0) {
      return res.redirect("/websites");
    }

    const dataPeriod = 7;
    const resultsLimit = 10;
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
    console.error(error);
    res.status(500).send("Error loading overview.");
  }
}

export async function showDashboard(req, res) {
  try {
    const { websiteId } = req.params;
    const { websites, archivedWebsites, allWebsites } = await getCommonData(res.locals.user.id);

    const currentWebsite = allWebsites.find((w) => w.id === websiteId);
    if (!currentWebsite) {
      return res.status(404).send("Website not found or you do not have permission to view it.");
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
    console.error(error);
    res.status(500).send("Error loading dashboard.");
  }
}

export async function showWebsites(res) {
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
    console.error(error);
    res.status(500).send("Error fetching websites.");
  }
}

export async function addWebsite(req, res) {
  const { name, domain, dataRetentionDays } = req.body;
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
    console.error("Error adding website:", error);
    res.status(500).send("Failed to add website.");
  }
}

export async function archiveWebsite(req, res) {
  const { id } = req.params;
  try {
    await ensureAdminAuth();
    const record = await pbAdmin.collection("websites").getOne(id);
    if (record.user === res.locals.user.id) {
      await pbAdmin.collection("websites").update(id, { isArchived: true });
    }
    res.redirect("/websites");
  } catch (error) {
    console.error("Error archiving website:", error);
    res.status(500).send("Failed to archive website.");
  }
}

export async function restoreWebsite(req, res) {
  const { id } = req.params;
  try {
    await ensureAdminAuth();
    const record = await pbAdmin.collection("websites").getOne(id);
    if (record.user === res.locals.user.id) {
      await pbAdmin.collection("websites").update(id, { isArchived: false });
    }
    res.redirect("/websites");
  } catch (error) {
    console.error("Error restoring website:", error);
    res.status(500).send("Failed to restore website.");
  }
}

export async function deleteWebsite(req, res) {
  const { id } = req.params;
  const { deleteData } = req.body;

  try {
    await ensureAdminAuth();
    const record = await pbAdmin.collection("websites").getOne(id);
    if (record.user !== res.locals.user.id) {
      return res.status(403).send("You do not have permission to delete this website.");
    }

    if (deleteData === "true") {
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
        } while (items.length > 0);
      }
    }

    await pbAdmin.collection("websites").delete(id);

    res.redirect("/websites");
  } catch (error) {
    console.error("Error deleting website:", error);
    res.status(500).send("Failed to delete website.");
  }
}

export async function getOverviewData(req, res) {
  try {
    const userId = res.locals.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { websites } = await getCommonData(userId);
    if (websites.length === 0) {
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

    res.status(200).json({ activeUsers, metrics, reports });
  } catch (error) {
    console.error("[API ERROR] Failed to fetch overview data:", error);
    res.status(500).json({ error: "Failed to fetch overview data." });
  }
}

export async function getDashboardData(req, res) {
  try {
    const { websiteId } = req.params;
    const userId = res.locals.user?.id;

    if (!userId) {
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

    res.status(200).json({ activeUsers, metrics, reports });
  } catch (error) {
    console.error("[API ERROR] Failed to fetch dashboard data:", error);
    res.status(500).json({ error: "Failed to fetch dashboard data." });
  }
}

export async function getDetailedReport(req, res) {
  try {
    await ensureAdminAuth();
    const { websiteId, reportType } = req.params;
    const userId = res.locals.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      await pbAdmin.collection("websites").getFirstListItem(`id="${websiteId}" && user.id="${userId}"`);
    } catch (error) {
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

      return res.status(200).json({ data: reportData });
    }

    const dataPeriod = Number.parseInt(req.query.period) || 7;
    const today = new Date();
    const currentStartDate = subDays(today, dataPeriod - 1);
    const currentEndDate = today;

    const summaries = await fetchSummaries(websiteId, currentStartDate, currentEndDate);
    const allData = getAllData(summaries, reportType);

    res.status(200).json({ data: allData });
  } catch (error) {
    console.error("[API ERROR] Failed to fetch detailed report:", error);
    res.status(500).json({ error: "Failed to fetch detailed report." });
  }
}

export async function getCustomEventDetails(req, res) {
  try {
    await ensureAdminAuth();
    const { websiteId } = req.params;
    const { name, period } = req.query;
    const userId = res.locals.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      await pbAdmin.collection("websites").getFirstListItem(`id="${websiteId}" && user.id="${userId}"`);
    } catch (error) {
      return res.status(403).json({ error: "Forbidden: You do not have access to this website." });
    }

    const dataPeriod = Number.parseInt(period) || 7;
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

    const uniqueEventData = [...new Set(events.map((e) => (e.eventData ? JSON.stringify(e.eventData, null, 2) : null)).filter(Boolean))];

    res.status(200).json({ data: uniqueEventData });
  } catch (error) {
    console.error("[API ERROR] Failed to fetch custom event details:", error);
    res.status(500).json({ error: "Failed to fetch custom event details." });
  }
}

export async function getWebsiteSettings(req, res) {
  try {
    await ensureAdminAuth();
    const { websiteId } = req.params;
    const userId = res.locals.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const website = await pbAdmin.collection("websites").getFirstListItem(`id="${websiteId}" && user.id="${userId}"`);
    res.status(200).json({ ipBlacklist: website.ipBlacklist || [] });
  } catch (error) {
    res.status(404).json({ error: "Website not found." });
  }
}

export async function updateWebsiteSettings(req, res) {
  try {
    await ensureAdminAuth();
    const { websiteId } = req.params;
    const userId = res.locals.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const website = await pbAdmin.collection("websites").getFirstListItem(`id="${websiteId}" && user.id="${userId}"`);

    const dataToUpdate = { ...req.body };
    if (dataToUpdate.dataRetentionDays !== undefined && dataToUpdate.dataRetentionDays !== null) {
      dataToUpdate.dataRetentionDays = Number(dataToUpdate.dataRetentionDays);
    }

    await pbAdmin.collection("websites").update(website.id, dataToUpdate);

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update settings." });
  }
}

export async function addIpToBlacklist(req, res) {
  try {
    await ensureAdminAuth();
    const { websiteId } = req.params;
    const { ip } = req.body;
    const userId = res.locals.user?.id;
    if (!userId || !ip) return res.status(400).json({ error: "Bad Request" });

    const website = await pbAdmin.collection("websites").getFirstListItem(`id="${websiteId}" && user.id="${userId}"`);
    const currentBlacklist = website.ipBlacklist || [];

    if (currentBlacklist.includes(ip)) {
      return res.status(409).json({ error: "IP already exists in blacklist." });
    }

    const newBlacklist = [...currentBlacklist, ip];
    await pbAdmin.collection("websites").update(website.id, { ipBlacklist: newBlacklist });

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to add IP to blacklist." });
  }
}

export async function removeIpFromBlacklist(req, res) {
  try {
    await ensureAdminAuth();
    const { websiteId } = req.params;
    const { ip } = req.body;
    const userId = res.locals.user?.id;
    if (!userId || !ip) return res.status(400).json({ error: "Bad Request" });

    const website = await pbAdmin.collection("websites").getFirstListItem(`id="${websiteId}" && user.id="${userId}"`);
    const currentBlacklist = website.ipBlacklist || [];

    const newBlacklist = currentBlacklist.filter((i) => i !== ip);
    await pbAdmin.collection("websites").update(website.id, { ipBlacklist: newBlacklist });

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to remove IP from blacklist." });
  }
}
