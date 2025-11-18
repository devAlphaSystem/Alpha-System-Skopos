import { pbAdmin, ensureAdminAuth } from "./pocketbase.js";
import { subDays } from "date-fns";
import dns from "node:dns/promises";
import { Agent } from "undici";
import logger from "../utils/logger.js";
import { triggerNotification } from "./notificationService.js";
import { recordUptimeSummary, getSummaryChecks, pruneUptimeSummary } from "./uptimeSummary.js";

const activeMonitors = new Map();
const MAX_TIMEOUT = 30000;
const MAX_RETRIES = 2;
const RECOVERY_RECHECK_DELAY_MS = 15000;
const DNS_ERROR_CODES = new Set(["ENOTFOUND", "EAI_AGAIN", "EAI_FAIL"]);
const ipv4Agent = new Agent({
  connect: {
    family: 4,
  },
});

function isDnsError(error) {
  const code = error?.code || error?.cause?.code;
  return code ? DNS_ERROR_CODES.has(code) : false;
}

async function fetchWithIPv4(url, signal, extraHeaders = {}) {
  return fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "Skopos-Uptime-Monitor/1.0",
      ...extraHeaders,
    },
    signal,
    redirect: "follow",
    dispatcher: ipv4Agent,
  });
}

async function fetchViaResolvedIp(url, signal) {
  const urlObj = new URL(url);
  const { address } = await dns.lookup(urlObj.hostname, { family: 4 });
  const ipUrl = `${urlObj.protocol}//${address}${urlObj.pathname}${urlObj.search}`;
  const response = await fetchWithIPv4(ipUrl, signal, { Host: urlObj.hostname });
  return { response, resolvedIp: address };
}

async function performSingleUptimeCheck(url, timeout = 10000) {
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Math.min(timeout, MAX_TIMEOUT));

  try {
    let response;
    try {
      response = await fetchWithIPv4(url, controller.signal);
    } catch (initialError) {
      if (isDnsError(initialError)) {
        logger.warn("DNS lookup failed for %s (%s). Attempting resolved IP fallback.", url, initialError.code || initialError.message);
        const fallback = await fetchViaResolvedIp(url, controller.signal);
        response = fallback.response;
        logger.debug("Resolved %s to %s for uptime check", url, fallback.resolvedIp);
      } else {
        throw initialError;
      }
    }

    const responseTime = Date.now() - startTime;
    const body = await response.text();
    const isUp = response.status >= 200 && response.status < 400;

    return {
      isUp,
      statusCode: response.status,
      responseTime,
      timestamp: new Date().toISOString(),
      error: null,
      ssl: url.startsWith("https:"),
      contentLength: body.length,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;

    let errorMessage = error.message;
    if (error.name === "AbortError") {
      errorMessage = "Request timeout";
    }

    logger.error("Uptime check failed for %s - %s (Type: %s, Code: %s)", url, errorMessage, error.name, error.code);

    return {
      isUp: false,
      statusCode: 0,
      responseTime,
      timestamp: new Date().toISOString(),
      error: errorMessage,
      ssl: false,
      contentLength: 0,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function performUptimeCheck(url, timeout = 10000) {
  let lastResult = null;
  let attemptCount = 0;

  for (let i = 0; i <= MAX_RETRIES; i++) {
    attemptCount++;
    lastResult = await performSingleUptimeCheck(url, timeout);

    if (lastResult.isUp) {
      if (attemptCount > 1) {
        logger.debug("Website %s is UP after %d attempt(s)", url, attemptCount);
      }
      return lastResult;
    }

    if (lastResult.error === "Request timeout" && i < MAX_RETRIES) {
      logger.debug("Timeout detected for %s, retrying... (attempt %d/%d)", url, attemptCount + 1, MAX_RETRIES + 1);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }

    if (lastResult.error !== "Request timeout") {
      break;
    }
  }

  if (url.startsWith("http://")) {
    const httpsUrl = url.replace("http://", "https://");
    logger.debug("HTTP failed for %s, trying HTTPS fallback: %s", url, httpsUrl);

    const httpsResult = await performSingleUptimeCheck(httpsUrl, timeout);
    if (httpsResult.isUp) {
      logger.info("HTTPS fallback succeeded for %s", url);
      return httpsResult;
    }
  }

  if (attemptCount > 1) {
    logger.warn("Website %s is DOWN after %d attempt(s): %s", url, attemptCount, lastResult.error);
  }

  return lastResult;
}

async function saveUptimeCheck(websiteId, checkResult) {
  try {
    await ensureAdminAuth();

    await pbAdmin.collection("uptime_checks").create({
      website: websiteId,
      isUp: checkResult.isUp,
      statusCode: checkResult.statusCode,
      responseTime: checkResult.responseTime,
      error: checkResult.error,
      ssl: checkResult.ssl,
      contentLength: checkResult.contentLength,
      timestamp: checkResult.timestamp,
    });

    await pbAdmin.collection("websites").update(websiteId, {
      lastUptimeCheck: checkResult.timestamp,
      currentStatus: checkResult.isUp ? "up" : "down",
    });

    await recordUptimeSummary(websiteId, checkResult);
    await cleanupOldUptimeChecks(websiteId);
    await cleanupOldUptimeIncidents(websiteId);

    logger.debug("Saved uptime check for website %s: %s", websiteId, checkResult.isUp ? "UP" : "DOWN");
  } catch (error) {
    logger.error("Error saving uptime check for website %s: %o", websiteId, error);
  }
}

async function cleanupOldUptimeChecks(websiteId) {
  try {
    await ensureAdminAuth();
    const retentionDays = Number.parseInt(process.env.DATA_RETENTION_DAYS || "180", 10);
    const cutoffISO = subDays(new Date(), retentionDays).toISOString();

    const staleChecks = await pbAdmin.collection("uptime_checks").getFullList({
      filter: `website.id = "${websiteId}" && timestamp < "${cutoffISO}"`,
      fields: "id",
      $autoCancel: false,
    });

    if (!staleChecks.length) {
      return;
    }

    for (const check of staleChecks) {
      await pbAdmin.collection("uptime_checks").delete(check.id);
    }

    logger.debug("Deleted %d uptime checks older than %d days for website %s", staleChecks.length, retentionDays, websiteId);
    await pruneUptimeSummary(websiteId);
  } catch (error) {
    logger.error("Error cleaning old uptime checks for website %s: %o", websiteId, error);
  }
}

async function cleanupOldUptimeIncidents(websiteId) {
  try {
    await ensureAdminAuth();
    const retentionDays = Number.parseInt(process.env.DATA_RETENTION_DAYS || "180", 10);
    const cutoffISO = subDays(new Date(), retentionDays).toISOString();

    const staleIncidents = await pbAdmin.collection("uptime_incidents").getFullList({
      filter: `website.id = "${websiteId}" && startTime < "${cutoffISO}" && isResolved = true`,
      fields: "id",
      $autoCancel: false,
    });

    if (!staleIncidents.length) {
      return;
    }

    for (const incident of staleIncidents) {
      await pbAdmin.collection("uptime_incidents").delete(incident.id);
    }

    logger.debug("Deleted %d uptime incidents older than %d days for website %s", staleIncidents.length, retentionDays, websiteId);
  } catch (error) {
    logger.error("Error cleaning old uptime incidents for website %s: %o", websiteId, error);
  }
}

function clearRecoveryRetry(websiteId) {
  const monitor = activeMonitors.get(websiteId);
  if (monitor?.recoveryTimeoutId) {
    clearTimeout(monitor.recoveryTimeoutId);
    monitor.recoveryTimeoutId = null;
    logger.debug("Cleared recovery re-check for website %s", websiteId);
  }
}

function scheduleRecoveryRetry(websiteId) {
  const monitor = activeMonitors.get(websiteId);
  if (!monitor) {
    return;
  }
  if (monitor.recoveryTimeoutId) {
    return;
  }

  monitor.recoveryTimeoutId = setTimeout(() => {
    monitor.recoveryTimeoutId = null;
    monitorWebsite(websiteId, monitor.domain, monitor.checkInterval, true).catch((error) => {
      logger.error("Error during recovery re-check for website %s: %o", websiteId, error);
      scheduleRecoveryRetry(websiteId);
    });
  }, RECOVERY_RECHECK_DELAY_MS);

  logger.debug("Scheduled recovery re-check for website %s in %dms", websiteId, RECOVERY_RECHECK_DELAY_MS);
}

async function handleStatusChange(websiteId, previousStatus, currentStatus, checkResult) {
  try {
    await ensureAdminAuth();

    if (previousStatus === currentStatus) {
      return;
    }

    const website = await pbAdmin.collection("websites").getOne(websiteId);

    if (currentStatus === "down" && previousStatus === "up") {
      const incident = await pbAdmin.collection("uptime_incidents").create({
        website: websiteId,
        startTime: checkResult.timestamp,
        endTime: null,
        duration: 0,
        isResolved: false,
        error: checkResult.error,
        statusCode: checkResult.statusCode,
      });

      logger.warn("Website %s (%s) went DOWN. Incident ID: %s", website.name, website.domain, incident.id);

      await dispatchUptimeNotification(website, {
        currentStatus,
        previousStatus,
        timestamp: checkResult.timestamp,
        downtimeStartedAt: checkResult.timestamp,
        statusCode: checkResult.statusCode,
        responseTime: checkResult.responseTime,
        errorMessage: checkResult.error,
        incidentId: incident.id,
      });
    } else if (currentStatus === "up" && previousStatus === "down") {
      const openIncidents = await pbAdmin.collection("uptime_incidents").getFullList({
        filter: `website.id = "${websiteId}" && isResolved = false`,
        sort: "-startTime",
      });

      for (const incident of openIncidents) {
        const startTime = new Date(incident.startTime);
        const endTime = new Date(checkResult.timestamp);
        const duration = endTime - startTime;

        await pbAdmin.collection("uptime_incidents").update(incident.id, {
          endTime: checkResult.timestamp,
          duration,
          isResolved: true,
        });

        const durationMinutes = Math.floor(duration / 60000);
        logger.info("Website %s (%s) is back UP. Downtime: %d minutes", website.name, website.domain, durationMinutes);

        await dispatchUptimeNotification(website, {
          currentStatus,
          previousStatus,
          timestamp: checkResult.timestamp,
          downtimeStartedAt: incident.startTime,
          downtimeEndedAt: checkResult.timestamp,
          durationMinutes,
          statusCode: checkResult.statusCode,
          responseTime: checkResult.responseTime,
          errorMessage: incident.error,
          incidentId: incident.id,
        });
      }
    }
  } catch (error) {
    logger.error("Error handling status change for website %s: %o", websiteId, error);
  }
}

async function monitorWebsite(websiteId, domain, checkInterval, triggeredByRecovery = false) {
  try {
    const url = domain.startsWith("http") ? domain : `https://${domain}`;
    const checkResult = await performUptimeCheck(url, 10000);

    await ensureAdminAuth();
    const website = await pbAdmin.collection("websites").getOne(websiteId);
    const previousStatus = website.currentStatus || "unknown";

    await saveUptimeCheck(websiteId, checkResult);
    await handleStatusChange(websiteId, previousStatus, checkResult.isUp ? "up" : "down", checkResult);

    if (checkResult.isUp) {
      clearRecoveryRetry(websiteId);
    } else {
      scheduleRecoveryRetry(websiteId);
    }
  } catch (error) {
    logger.error("Error monitoring website %s: %o", websiteId, error);
    if (triggeredByRecovery) {
      scheduleRecoveryRetry(websiteId);
    }
  }
}

export function startMonitoring(websiteId, domain, checkInterval = 60000) {
  if (activeMonitors.has(websiteId)) {
    logger.debug("Monitor already running for website %s", websiteId);
    return;
  }

  logger.info("Starting uptime monitor for website %s with interval %d ms", websiteId, checkInterval);
  const monitorState = {
    intervalId: null,
    domain,
    checkInterval,
    recoveryTimeoutId: null,
  };
  activeMonitors.set(websiteId, monitorState);

  monitorWebsite(websiteId, domain, checkInterval);

  monitorState.intervalId = setInterval(() => {
    monitorWebsite(websiteId, domain, checkInterval);
  }, checkInterval);
}

export function stopMonitoring(websiteId) {
  const monitor = activeMonitors.get(websiteId);
  if (monitor) {
    clearInterval(monitor.intervalId);
    if (monitor.recoveryTimeoutId) {
      clearTimeout(monitor.recoveryTimeoutId);
    }
    activeMonitors.delete(websiteId);
    logger.info("Stopped uptime monitor for website %s", websiteId);
  }
}

export function updateMonitoringInterval(websiteId, newInterval) {
  const monitor = activeMonitors.get(websiteId);
  if (monitor && monitor.checkInterval !== newInterval) {
    stopMonitoring(websiteId);
    startMonitoring(websiteId, monitor.domain, newInterval);
    logger.info("Updated monitoring interval for website %s to %d ms", websiteId, newInterval);
  }
}

export async function initializeUptimeMonitoring() {
  try {
    await ensureAdminAuth();
    const websites = await pbAdmin.collection("websites").getFullList({
      filter: "isArchived = false && uptimeMonitoring = true",
    });

    logger.info("Initializing uptime monitoring for %d websites", websites.length);

    for (const website of websites) {
      const checkInterval = (website.uptimeCheckInterval || 60) * 1000;
      startMonitoring(website.id, website.domain, checkInterval);
    }
  } catch (error) {
    logger.error("Error initializing uptime monitoring: %o", error);
  }
}

export async function getUptimeStats(websiteId, hours = 24) {
  try {
    const checks = await getSummaryChecks(websiteId, hours);

    if (checks.length === 0) {
      return {
        uptimePercentage: 100,
        totalChecks: 0,
        successfulChecks: 0,
        failedChecks: 0,
        avgResponseTime: 0,
        minResponseTime: 0,
        maxResponseTime: 0,
        currentStatus: "unknown",
      };
    }

    const successfulChecks = checks.filter((c) => c.isUp).length;
    const failedChecks = checks.length - successfulChecks;
    const uptimePercentage = ((successfulChecks / checks.length) * 100).toFixed(2);

    const responseTimes = checks.map((c) => (Number.isFinite(c.responseTime) ? c.responseTime : Number.parseFloat(c.responseTime) || 0));
    const avgResponseTime = Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length);
    const minResponseTime = Math.min(...responseTimes);
    const maxResponseTime = Math.max(...responseTimes);

    const currentStatus = checks[checks.length - 1].isUp ? "up" : "down";

    return {
      uptimePercentage: Number.parseFloat(uptimePercentage),
      totalChecks: checks.length,
      successfulChecks,
      failedChecks,
      avgResponseTime,
      minResponseTime,
      maxResponseTime,
      currentStatus,
    };
  } catch (error) {
    logger.error("Error getting uptime stats for website %s: %o", websiteId, error);
    return {
      uptimePercentage: 0,
      totalChecks: 0,
      successfulChecks: 0,
      failedChecks: 0,
      avgResponseTime: 0,
      minResponseTime: 0,
      maxResponseTime: 0,
      currentStatus: "error",
    };
  }
}

export async function getUptimeTimeline(websiteId, hours = 24) {
  try {
    const checks = await getSummaryChecks(websiteId, hours);

    return checks.map((check) => ({
      timestamp: check.timestamp,
      isUp: check.isUp,
      responseTime: check.responseTime,
      statusCode: check.statusCode,
      error: check.error,
    }));
  } catch (error) {
    logger.error("Error getting uptime timeline for website %s: %o", websiteId, error);
    return [];
  }
}

export async function getRecentIncidents(websiteId, limit = 10) {
  try {
    await ensureAdminAuth();
    const incidents = await pbAdmin.collection("uptime_incidents").getList(1, limit, {
      filter: `website.id = "${websiteId}"`,
      sort: "-startTime",
      $autoCancel: false,
    });

    return incidents.items.map((incident) => ({
      id: incident.id,
      startTime: incident.startTime,
      endTime: incident.endTime,
      duration: incident.duration,
      isResolved: incident.isResolved,
      error: incident.error,
      statusCode: incident.statusCode,
    }));
  } catch (error) {
    logger.error("Error getting recent incidents for website %s: %o", websiteId, error);
    return [];
  }
}

export async function getUptimeByDay(websiteId, days = 30) {
  try {
    const startDate = subDays(new Date(), days);
    const startMs = startDate.getTime();
    const retentionDays = Number.parseInt(process.env.DATA_RETENTION_DAYS || "180", 10);
    const hoursToFetch = Math.min(days * 24, retentionDays * 24);
    const candidateChecks = await getSummaryChecks(websiteId, hoursToFetch);
    const checks = candidateChecks.filter((check) => {
      const ts = new Date(check.timestamp).getTime();
      return Number.isFinite(ts) && ts >= startMs;
    });

    const dailyStats = new Map();

    for (const check of checks) {
      const date = new Date(check.timestamp).toISOString().split("T")[0];

      if (!dailyStats.has(date)) {
        dailyStats.set(date, {
          date,
          total: 0,
          up: 0,
          down: 0,
          avgResponseTime: 0,
          responseTimes: [],
        });
      }

      const stats = dailyStats.get(date);
      stats.total++;
      if (check.isUp) {
        stats.up++;
      } else {
        stats.down++;
      }
      const responseTime = Number.isFinite(check.responseTime) ? check.responseTime : Number.parseFloat(check.responseTime) || 0;
      stats.responseTimes.push(responseTime);
    }

    return Array.from(dailyStats.values()).map((stats) => ({
      date: stats.date,
      uptimePercentage: ((stats.up / stats.total) * 100).toFixed(2),
      totalChecks: stats.total,
      upChecks: stats.up,
      downChecks: stats.down,
      avgResponseTime: Math.round(stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length),
    }));
  } catch (error) {
    logger.error("Error getting uptime by day for website %s: %o", websiteId, error);
    return [];
  }
}

export async function calculateUptimePercentage(websiteId, startDate, endDate) {
  try {
    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      return 0;
    }

    const retentionDays = Number.parseInt(process.env.DATA_RETENTION_DAYS || "180", 10);
    const candidateChecks = await getSummaryChecks(websiteId, retentionDays * 24);
    const checks = candidateChecks.filter((check) => {
      const ts = new Date(check.timestamp).getTime();
      return Number.isFinite(ts) && ts >= startMs && ts <= endMs;
    });

    if (checks.length === 0) {
      return 100;
    }

    const successfulChecks = checks.filter((c) => c.isUp).length;
    return ((successfulChecks / checks.length) * 100).toFixed(2);
  } catch (error) {
    logger.error("Error calculating uptime percentage for website %s: %o", websiteId, error);
    return 0;
  }
}

export async function manualUptimeCheck(websiteId, domain) {
  try {
    const url = domain.startsWith("http") ? domain : `https://${domain}`;
    const checkResult = await performUptimeCheck(url, 10000);

    await ensureAdminAuth();
    const website = await pbAdmin.collection("websites").getOne(websiteId);
    const previousStatus = website.currentStatus || "unknown";

    await saveUptimeCheck(websiteId, checkResult);
    await handleStatusChange(websiteId, previousStatus, checkResult.isUp ? "up" : "down", checkResult);

    return checkResult;
  } catch (error) {
    logger.error("Error performing manual uptime check for website %s: %o", websiteId, error);
    throw error;
  }
}

async function dispatchUptimeNotification(website, payload) {
  if (!website?.user) {
    return;
  }

  try {
    await triggerNotification(website.user, website.id, "uptime_status", {
      websiteName: website.name,
      websiteDomain: website.domain,
      ...payload,
    });
  } catch (error) {
    logger.error("Error dispatching uptime notification for website %s: %o", website.id, error);
  }
}
