import { subDays } from "date-fns";
import { ensureAdminAuth, pbAdmin } from "./pocketbase.js";
import logger from "../utils/logger.js";

const SUMMARY_COLLECTION = "uptime_sum";

function getRetentionDays() {
  return Number.parseInt(process.env.DATA_RETENTION_DAYS || "180", 10);
}

function getRetentionMs() {
  return getRetentionDays() * 24 * 60 * 60 * 1000;
}

function sanitizeTimestamp(value) {
  if (!value) {
    return new Date().toISOString();
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
}

function normalizeCheckPayload(payload) {
  if (!payload) {
    return null;
  }

  return {
    timestamp: sanitizeTimestamp(payload.timestamp || payload.created),
    isUp: Boolean(payload.isUp),
    responseTime: Number.isFinite(payload.responseTime) ? payload.responseTime : Number.parseFloat(payload.responseTime) || 0,
    statusCode: Number.isFinite(payload.statusCode) ? payload.statusCode : Number.parseInt(payload.statusCode ?? 0, 10) || 0,
    error: payload.error ?? null,
  };
}

function pruneChecks(checks) {
  const cutoffMs = Date.now() - getRetentionMs();
  return (checks || []).filter((check) => {
    if (!check?.timestamp) {
      return false;
    }
    const ts = new Date(check.timestamp).getTime();
    return Number.isFinite(ts) && ts >= cutoffMs;
  });
}

function sortChecks(checks) {
  return [...checks].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

function ensureSummaryShape(summary) {
  if (!summary || typeof summary !== "object") {
    return { checks: [], lastUpdated: null };
  }
  const preparedChecks = Array.isArray(summary.checks) ? summary.checks : [];
  return {
    checks: sortChecks(preparedChecks.filter((check) => Boolean(check?.timestamp))),
    lastUpdated: summary.lastUpdated || null,
  };
}

async function buildSummaryFromExistingChecks(websiteId) {
  const cutoffISO = subDays(new Date(), getRetentionDays()).toISOString();
  const rawChecks = await pbAdmin.collection("uptime_checks").getFullList({
    filter: `website.id = "${websiteId}" && timestamp >= "${cutoffISO}"`,
    sort: "timestamp",
    $autoCancel: false,
  });

  const checks = rawChecks.map((record) => normalizeCheckPayload(record)).filter(Boolean);

  return {
    checks,
    lastUpdated: new Date().toISOString(),
  };
}

async function ensureSummaryRecord(websiteId) {
  await ensureAdminAuth();
  try {
    return await pbAdmin.collection(SUMMARY_COLLECTION).getFirstListItem(`website.id = "${websiteId}"`);
  } catch (error) {
    if (error?.status !== 404) {
      throw error;
    }

    logger.info("No uptime summary found for website %s. Creating a new one from existing checks.", websiteId);
    const summary = await buildSummaryFromExistingChecks(websiteId);
    return await pbAdmin.collection(SUMMARY_COLLECTION).create({
      website: websiteId,
      summary,
    });
  }
}

export async function recordUptimeSummary(websiteId, checkResult) {
  try {
    const record = await ensureSummaryRecord(websiteId);
    const summary = ensureSummaryShape(record.summary);
    const checks = pruneChecks(summary.checks);
    const normalizedCheck = normalizeCheckPayload(checkResult);

    if (normalizedCheck) {
      checks.push(normalizedCheck);
    }

    const nextSummary = {
      checks: sortChecks(checks),
      lastUpdated: new Date().toISOString(),
    };

    await pbAdmin.collection(SUMMARY_COLLECTION).update(record.id, { summary: nextSummary });
  } catch (error) {
    logger.error("Failed to update uptime summary for website %s: %o", websiteId, error);
  }
}

export async function getSummaryChecks(websiteId, hours = 24) {
  try {
    const record = await ensureSummaryRecord(websiteId);
    const summary = ensureSummaryShape(record.summary);
    const cutoffMs = Date.now() - hours * 60 * 60 * 1000;

    return summary.checks.filter((check) => {
      const ts = new Date(check.timestamp).getTime();
      return Number.isFinite(ts) && ts >= cutoffMs;
    });
  } catch (error) {
    logger.error("Failed to read uptime summary for website %s: %o", websiteId, error);
    return [];
  }
}

export async function rebuildUptimeSummary(websiteId) {
  try {
    await ensureAdminAuth();
    const summary = await buildSummaryFromExistingChecks(websiteId);
    const existing = await ensureSummaryRecord(websiteId);
    await pbAdmin.collection(SUMMARY_COLLECTION).update(existing.id, { summary });
    return summary;
  } catch (error) {
    logger.error("Failed to rebuild uptime summary for website %s: %o", websiteId, error);
    throw error;
  }
}

export async function pruneUptimeSummary(websiteId) {
  try {
    const record = await ensureSummaryRecord(websiteId);
    const summary = ensureSummaryShape(record.summary);
    const cleaned = pruneChecks(summary.checks);
    if (cleaned.length === summary.checks.length) {
      return;
    }

    await pbAdmin.collection(SUMMARY_COLLECTION).update(record.id, {
      summary: {
        checks: sortChecks(cleaned),
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error("Failed to prune uptime summary for website %s: %o", websiteId, error);
  }
}
