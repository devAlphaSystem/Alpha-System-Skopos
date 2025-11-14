import { pbAdmin, ensureAdminAuth } from "../services/pocketbase.js";
import { getUptimeStats, getUptimeTimeline, getRecentIncidents, manualUptimeCheck, startMonitoring, stopMonitoring, updateMonitoringInterval } from "../services/uptimeMonitor.js";
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

export async function showUptime(req, res) {
  const { websiteId } = req.params;
  logger.info("Rendering uptime page for website: %s, user: %s", websiteId, res.locals.user.id);

  try {
    const { websites, archivedWebsites, allWebsites } = await getCommonData(res.locals.user.id);

    const currentWebsite = allWebsites.find((w) => w.id === websiteId);
    if (!currentWebsite) {
      logger.warn("User %s attempted to access unauthorized or non-existent website %s", res.locals.user.id, websiteId);
      return res.status(404).render("404");
    }

    const stats24h = await getUptimeStats(websiteId, 24);
    const stats7d = await getUptimeStats(websiteId, 24 * 7);
    const stats30d = await getUptimeStats(websiteId, 24 * 30);

    const timeline = await getUptimeTimeline(websiteId, 24 * 7);

    const incidents = await getRecentIncidents(websiteId, 20);

    const totalIncidents = incidents.length;
    const unresolvedIncidents = incidents.filter((i) => !i.isResolved).length;
    const avgIncidentDuration = incidents.length > 0 ? Math.round(incidents.filter((i) => i.duration > 0).reduce((sum, i) => sum + i.duration, 0) / incidents.filter((i) => i.duration > 0).length / 60000) : 0;

    const resolvedIncidents = incidents.filter((i) => i.isResolved && i.duration > 0);
    const mttr = resolvedIncidents.length > 0 ? Math.round(resolvedIncidents.reduce((sum, i) => sum + i.duration, 0) / resolvedIncidents.length / 60000) : 0;

    const mtbf = incidents.length > 1 ? Math.round((24 * 30 * 60) / incidents.length) : 0;

    const metrics = {
      current: {
        status: stats24h.currentStatus,
        responseTime: stats24h.avgResponseTime,
        uptime24h: stats24h.uptimePercentage,
        uptime7d: stats7d.uptimePercentage,
        uptime30d: stats30d.uptimePercentage,
      },
      stats: {
        totalChecks24h: stats24h.totalChecks,
        successfulChecks24h: stats24h.successfulChecks,
        failedChecks24h: stats24h.failedChecks,
        avgResponseTime: stats24h.avgResponseTime,
        minResponseTime: stats24h.minResponseTime,
        maxResponseTime: stats24h.maxResponseTime,
      },
      reliability: {
        totalIncidents,
        unresolvedIncidents,
        avgIncidentDuration,
        mttr,
        mtbf,
      },
    };

    logger.debug("Uptime page data for website %s calculated successfully. Rendering page.", websiteId);

    res.render("uptime", {
      websites,
      archivedWebsites,
      currentWebsite,
      metrics,
      timeline,
      incidents,
      currentPage: "uptime",
    });
  } catch (error) {
    logger.error("Error loading uptime page for website %s: %o", websiteId, error);
    res.status(500).render("500");
  }
}

export async function getUptimeData(req, res) {
  const { websiteId } = req.params;
  const { hours = 24 } = req.query;

  logger.info("Fetching uptime data for website: %s, hours: %s", websiteId, hours);

  try {
    await ensureAdminAuth();

    const website = await pbAdmin.collection("websites").getOne(websiteId);
    if (website.user !== res.locals.user.id) {
      logger.warn("User %s attempted to access unauthorized website %s", res.locals.user.id, websiteId);
      return res.status(403).json({ error: "Unauthorized" });
    }

    const stats = await getUptimeStats(websiteId, parseInt(hours));
    const timeline = await getUptimeTimeline(websiteId, parseInt(hours));
    const incidents = await getRecentIncidents(websiteId, 10);

    res.json({
      stats,
      timeline,
      incidents,
    });
  } catch (error) {
    logger.error("Error fetching uptime data for website %s: %o", websiteId, error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function performManualCheck(req, res) {
  const { websiteId } = req.params;

  logger.info("Performing manual uptime check for website: %s, user: %s", websiteId, res.locals.user.id);

  try {
    await ensureAdminAuth();

    const website = await pbAdmin.collection("websites").getOne(websiteId);
    if (website.user !== res.locals.user.id) {
      logger.warn("User %s attempted to check unauthorized website %s", res.locals.user.id, websiteId);
      return res.status(403).json({ error: "Unauthorized" });
    }

    const checkResult = await manualUptimeCheck(websiteId, website.domain);

    logger.info("Manual uptime check completed for website %s: %s", websiteId, checkResult.isUp ? "UP" : "DOWN");

    res.json({
      success: true,
      result: checkResult,
    });
  } catch (error) {
    logger.error("Error performing manual uptime check for website %s: %o", websiteId, error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function toggleUptimeMonitoring(req, res) {
  const { websiteId } = req.params;
  const { enabled } = req.body;

  logger.info("Toggling uptime monitoring for website: %s to %s", websiteId, enabled ? "enabled" : "disabled");

  try {
    await ensureAdminAuth();

    const website = await pbAdmin.collection("websites").getOne(websiteId);
    if (website.user !== res.locals.user.id) {
      logger.warn("User %s attempted to modify unauthorized website %s", res.locals.user.id, websiteId);
      return res.status(403).json({ error: "Unauthorized" });
    }

    await pbAdmin.collection("websites").update(websiteId, {
      uptimeMonitoring: enabled,
    });

    if (enabled) {
      const checkInterval = (website.uptimeCheckInterval || 60) * 1000;
      startMonitoring(websiteId, website.domain, checkInterval);
    } else {
      stopMonitoring(websiteId);
    }

    logger.info("Uptime monitoring for website %s is now %s", websiteId, enabled ? "enabled" : "disabled");

    res.json({
      success: true,
      enabled,
    });
  } catch (error) {
    logger.error("Error toggling uptime monitoring for website %s: %o", websiteId, error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function updateCheckInterval(req, res) {
  const { websiteId } = req.params;
  const { interval } = req.body;

  logger.info("Updating check interval for website: %s to %d seconds", websiteId, interval);

  try {
    await ensureAdminAuth();

    const website = await pbAdmin.collection("websites").getOne(websiteId);
    if (website.user !== res.locals.user.id) {
      logger.warn("User %s attempted to modify unauthorized website %s", res.locals.user.id, websiteId);
      return res.status(403).json({ error: "Unauthorized" });
    }

    const intervalSeconds = Math.max(30, Math.min(3600, parseInt(interval)));

    await pbAdmin.collection("websites").update(websiteId, {
      uptimeCheckInterval: intervalSeconds,
    });

    if (website.uptimeMonitoring) {
      updateMonitoringInterval(websiteId, intervalSeconds * 1000);
    }

    logger.info("Check interval for website %s updated to %d seconds", websiteId, intervalSeconds);

    res.json({
      success: true,
      interval: intervalSeconds,
    });
  } catch (error) {
    logger.error("Error updating check interval for website %s: %o", websiteId, error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function resolveIncident(req, res) {
  const { websiteId, incidentId } = req.params;

  logger.info("Resolving incident %s for website: %s", incidentId, websiteId);

  try {
    await ensureAdminAuth();

    const website = await pbAdmin.collection("websites").getOne(websiteId);
    if (website.user !== res.locals.user.id) {
      logger.warn("User %s attempted to modify unauthorized website %s", res.locals.user.id, websiteId);
      return res.status(403).json({ error: "Unauthorized" });
    }

    const incident = await pbAdmin.collection("uptime_incidents").getOne(incidentId);
    if (incident.website !== websiteId) {
      logger.warn("Incident %s does not belong to website %s", incidentId, websiteId);
      return res.status(404).json({ error: "Incident not found" });
    }

    const endTime = new Date().toISOString();
    const startTime = new Date(incident.startTime);
    const duration = new Date(endTime) - startTime;

    await pbAdmin.collection("uptime_incidents").update(incidentId, {
      endTime,
      duration,
      isResolved: true,
    });

    logger.info("Incident %s resolved for website %s", incidentId, websiteId);

    res.json({
      success: true,
      incident: {
        id: incidentId,
        endTime,
        duration,
        isResolved: true,
      },
    });
  } catch (error) {
    logger.error("Error resolving incident %s: %o", incidentId, error);
    res.status(500).json({ error: "Internal server error" });
  }
}
