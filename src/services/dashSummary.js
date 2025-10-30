import { ensureAdminAuth, pbAdmin } from "./pocketbase.js";
import { calculateMetrics } from "../utils/analytics.js";
import logger from "./logger.js";

function toDateKey(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function createEmptyAdjustment() {
  return {
    visitors: 0,
    newVisitors: 0,
    returningVisitors: 0,
    engagedSessions: 0,
    pageViews: 0,
    jsErrors: 0,
    topPages: new Map(),
    entryPages: new Map(),
    exitPages: new Map(),
    topReferrers: new Map(),
    deviceBreakdown: new Map(),
    browserBreakdown: new Map(),
    languageBreakdown: new Map(),
    countryBreakdown: new Map(),
    topCustomEvents: new Map(),
    topJsErrors: new Map(),
  };
}

function ensureAdjustment(adjustments, dateKey) {
  if (!dateKey) {
    return null;
  }
  if (!adjustments.has(dateKey)) {
    adjustments.set(dateKey, createEmptyAdjustment());
  }
  return adjustments.get(dateKey);
}

function normalizeReferrer(referrer) {
  if (!referrer) {
    return "Direct";
  }
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "");
    return host || "Direct";
  } catch (error) {
    return referrer;
  }
}

function recordMapDelta(targetMap, key, delta) {
  if (!targetMap || !delta) {
    return;
  }
  if (typeof key !== "string") {
    return;
  }
  const cleaned = key.trim();
  if (!cleaned) {
    return;
  }
  const next = (targetMap.get(cleaned) || 0) + delta;
  if (next === 0) {
    targetMap.delete(cleaned);
  } else {
    targetMap.set(cleaned, next);
  }
}

function parseDuration(value) {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
}

export function initializeAdjustments() {
  return new Map();
}

export function accumulateSessionAdjustments(adjustments, session, events) {
  if (!session) {
    return;
  }

  const orderedEvents = [...(events || [])].sort((a, b) => new Date(a.created) - new Date(b.created));
  const firstEvent = orderedEvents[0];
  const firstDateKey = toDateKey(firstEvent?.created || session.created);
  const firstAdjustment = ensureAdjustment(adjustments, firstDateKey);

  if (firstAdjustment) {
    firstAdjustment.visitors -= 1;
    if (session.isNewVisitor) {
      firstAdjustment.newVisitors -= 1;
    } else {
      firstAdjustment.returningVisitors -= 1;
    }

    const entryPath = firstEvent?.path || session.entryPath;
    if (entryPath) {
      recordMapDelta(firstAdjustment.entryPages, entryPath, -1);
    }

    const referrerKey = normalizeReferrer(session.referrer);
    recordMapDelta(firstAdjustment.topReferrers, referrerKey, -1);

    recordMapDelta(firstAdjustment.deviceBreakdown, session.device || "Unknown", -1);
    recordMapDelta(firstAdjustment.browserBreakdown, session.browser || "Unknown", -1);
    recordMapDelta(firstAdjustment.languageBreakdown, session.language || "Unknown", -1);
    recordMapDelta(firstAdjustment.countryBreakdown, session.country || "Unknown", -1);
  }

  let eventCount = 0;
  let engagedRecorded = false;

  for (const event of orderedEvents) {
    eventCount += 1;
    const dateKey = toDateKey(event.created);
    const adjustment = ensureAdjustment(adjustments, dateKey);
    if (!adjustment) {
      continue;
    }

    if (event.type === "pageView") {
      adjustment.pageViews -= 1;
      if (event.path) {
        recordMapDelta(adjustment.topPages, event.path, -1);
      }
    } else if (event.type === "custom" && event.eventName) {
      recordMapDelta(adjustment.topCustomEvents, event.eventName, -1);
    }

    if (!engagedRecorded) {
      const duration = parseDuration(event.eventData?.duration);
      const isEngagedTrigger = eventCount >= 2 || (duration !== null && duration > 10);
      if (isEngagedTrigger) {
        adjustment.engagedSessions -= 1;
        engagedRecorded = true;
      }
    }
  }

  const lastEvent = orderedEvents[orderedEvents.length - 1];
  const exitPath = lastEvent?.path || session.exitPath;
  const exitDateKey = toDateKey(lastEvent?.created || session.updated);
  const exitAdjustment = ensureAdjustment(adjustments, exitDateKey);
  if (exitAdjustment && exitPath) {
    recordMapDelta(exitAdjustment.exitPages, exitPath, -1);
  }
}

export function accumulateJsErrorAdjustments(adjustments, jsErrors) {
  for (const errorRecord of jsErrors || []) {
    const dateKey = toDateKey(errorRecord.created || errorRecord.lastSeen);
    const adjustment = ensureAdjustment(adjustments, dateKey);
    if (!adjustment) {
      continue;
    }
    const count = typeof errorRecord.count === "number" && !Number.isNaN(errorRecord.count) ? errorRecord.count : 1;
    if (count === 0) {
      continue;
    }
    adjustment.jsErrors -= count;
    if (errorRecord.errorMessage) {
      recordMapDelta(adjustment.topJsErrors, errorRecord.errorMessage, -count);
    }
  }
}

function applyListAdjustments(existingList = [], adjustmentsMap) {
  if (!adjustmentsMap || adjustmentsMap.size === 0) {
    return existingList;
  }
  const workingMap = new Map();
  for (const item of existingList) {
    if (!item || !item.key) {
      continue;
    }
    const currentCount = typeof item.count === "number" ? item.count : Number.parseFloat(item.count) || 0;
    workingMap.set(item.key, currentCount);
  }

  for (const [key, delta] of adjustmentsMap.entries()) {
    const current = workingMap.get(key) || 0;
    const next = current + delta;
    if (next > 0) {
      workingMap.set(key, next);
    } else {
      workingMap.delete(key);
    }
  }

  return Array.from(workingMap.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

function isSummaryEmpty(summary) {
  const numericFields = ["pageViews", "visitors", "newVisitors", "returningVisitors", "engagedSessions", "jsErrors"];
  const hasNumeric = numericFields.some((field) => (summary[field] || 0) > 0);
  if (hasNumeric) {
    return false;
  }

  const listFields = ["topPages", "entryPages", "exitPages", "topReferrers", "deviceBreakdown", "browserBreakdown", "languageBreakdown", "countryBreakdown", "topCustomEvents", "topJsErrors"];
  return !listFields.some((field) => Array.isArray(summary[field]) && summary[field].length > 0);
}

async function recalculateDerivedMetrics(websiteId, dateKey) {
  const start = `${dateKey} 00:00:00.000Z`;
  const end = `${dateKey} 23:59:59.999Z`;

  const [sessions, events] = await Promise.all([
    pbAdmin.collection("sessions").getFullList({
      filter: `website.id = "${websiteId}" && created >= "${start}" && created <= "${end}"`,
      fields: "id,created,updated",
      $autoCancel: false,
    }),
    pbAdmin.collection("events").getFullList({
      filter: `session.website.id = "${websiteId}" && created >= "${start}" && created <= "${end}"`,
      fields: "id,session",
      $autoCancel: false,
    }),
  ]);

  return calculateMetrics(sessions, events);
}

export async function applyDashSummaryAdjustments(websiteId, adjustments) {
  if (!adjustments || adjustments.size === 0) {
    return;
  }

  await ensureAdminAuth();

  for (const [dateKey, adjustment] of adjustments.entries()) {
    if (!dateKey) {
      continue;
    }

    let summaryRecord;
    try {
      summaryRecord = await pbAdmin.collection("dash_sum").getFirstListItem(`website.id="${websiteId}" && date ~ "${dateKey}%"`);
    } catch (error) {
      if (error.status === 404) {
        logger.debug("No dash_sum record found for website %s on %s, skipping adjustment.", websiteId, dateKey);
        continue;
      }
      throw error;
    }

    const summary = { ...(summaryRecord.summary || {}) };

    const applyNumeric = (field, delta) => {
      if (!delta) {
        return;
      }
      const current = typeof summary[field] === "number" ? summary[field] : Number.parseFloat(summary[field]) || 0;
      summary[field] = Math.max(0, current + delta);
    };

    applyNumeric("pageViews", adjustment.pageViews);
    applyNumeric("visitors", adjustment.visitors);
    applyNumeric("newVisitors", adjustment.newVisitors);
    applyNumeric("returningVisitors", adjustment.returningVisitors);
    applyNumeric("engagedSessions", adjustment.engagedSessions);
    applyNumeric("jsErrors", adjustment.jsErrors);

    summary.topPages = applyListAdjustments(summary.topPages, adjustment.topPages);
    summary.entryPages = applyListAdjustments(summary.entryPages, adjustment.entryPages);
    summary.exitPages = applyListAdjustments(summary.exitPages, adjustment.exitPages);
    summary.topReferrers = applyListAdjustments(summary.topReferrers, adjustment.topReferrers);
    summary.deviceBreakdown = applyListAdjustments(summary.deviceBreakdown, adjustment.deviceBreakdown);
    summary.browserBreakdown = applyListAdjustments(summary.browserBreakdown, adjustment.browserBreakdown);
    summary.languageBreakdown = applyListAdjustments(summary.languageBreakdown, adjustment.languageBreakdown);
    summary.countryBreakdown = applyListAdjustments(summary.countryBreakdown, adjustment.countryBreakdown);
    summary.topCustomEvents = applyListAdjustments(summary.topCustomEvents, adjustment.topCustomEvents);
    summary.topJsErrors = applyListAdjustments(summary.topJsErrors, adjustment.topJsErrors);

    try {
      const metrics = await recalculateDerivedMetrics(websiteId, dateKey);
      summary.bounceRate = metrics.bounceRate;
      summary.avgSessionDuration = metrics.avgSessionDuration;
    } catch (error) {
      logger.warn("Failed to recalculate derived metrics for website %s on %s: %o", websiteId, dateKey, error);
    }

    if (isSummaryEmpty(summary)) {
      await pbAdmin.collection("dash_sum").delete(summaryRecord.id);
      logger.debug("Removed empty dash_sum record %s for website %s on %s after adjustments.", summaryRecord.id, websiteId, dateKey);
      continue;
    }

    await pbAdmin.collection("dash_sum").update(summaryRecord.id, { summary });
    logger.debug("Updated dash_sum record %s for website %s on %s after adjustments.", summaryRecord.id, websiteId, dateKey);
  }
}
