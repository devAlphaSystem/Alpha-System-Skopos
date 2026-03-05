import { subDays, startOfDay, endOfDay } from "date-fns";
import { pbAdmin, ensureAdminAuth } from "./pocketbase.js";
import { fetchRecordsForPeriod, calculateMetricsFromData, buildSessionEventsMap } from "./analyticsService.js";
import cacheService from "./cacheService.js";
import logger from "../utils/logger.js";

const COLLECTION = "daily_stats";

function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeReferrer(referrer) {
  if (!referrer) return "Direct";
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "");
    return host || "Direct";
  } catch {
    return referrer;
  }
}

function computeBreakdowns(sessions, events, sessionEventsMap) {
  const topPages = new Map();
  const entryPages = new Map();
  const exitPages = new Map();
  const topReferrers = new Map();
  const deviceBreakdown = new Map();
  const browserBreakdown = new Map();
  const languageBreakdown = new Map();
  const countryBreakdown = new Map();
  const stateBreakdown = new Map();
  const topCustomEvents = new Map();
  const topJsErrors = new Map();

  for (const session of sessions) {
    const sessionEvents = sessionEventsMap.get(session.id) || [];
    if (sessionEvents.length > 0) {
      sessionEvents.sort((a, b) => new Date(a.created) - new Date(b.created));
      const firstEvent = sessionEvents[0];
      const lastEvent = sessionEvents[sessionEvents.length - 1];

      const entryPath = firstEvent.path || session.entryPath;
      if (entryPath) entryPages.set(entryPath, (entryPages.get(entryPath) || 0) + 1);

      const exitPath = lastEvent.path || session.exitPath;
      if (exitPath) exitPages.set(exitPath, (exitPages.get(exitPath) || 0) + 1);

      for (const event of sessionEvents) {
        if (event.type === "pageView" && event.path) {
          topPages.set(event.path, (topPages.get(event.path) || 0) + 1);
        } else if (event.type === "custom" && event.eventName && event.eventName !== "exit") {
          topCustomEvents.set(event.eventName, (topCustomEvents.get(event.eventName) || 0) + 1);
        }
      }
    }

    const referrerKey = normalizeReferrer(session.referrer);
    topReferrers.set(referrerKey, (topReferrers.get(referrerKey) || 0) + 1);
    deviceBreakdown.set(session.device || "Unknown", (deviceBreakdown.get(session.device || "Unknown") || 0) + 1);
    browserBreakdown.set(session.browser || "Unknown", (browserBreakdown.get(session.browser || "Unknown") || 0) + 1);
    languageBreakdown.set(session.language || "Unknown", (languageBreakdown.get(session.language || "Unknown") || 0) + 1);
    countryBreakdown.set(session.country || "Unknown", (countryBreakdown.get(session.country || "Unknown") || 0) + 1);
    stateBreakdown.set(`${session.country || "Unknown"}|${session.state || "Unknown"}`, (stateBreakdown.get(`${session.country || "Unknown"}|${session.state || "Unknown"}`) || 0) + 1);
  }

  const mapToObj = (m) => Object.fromEntries(m);
  return {
    topPages: mapToObj(topPages),
    entryPages: mapToObj(entryPages),
    exitPages: mapToObj(exitPages),
    topReferrers: mapToObj(topReferrers),
    deviceBreakdown: mapToObj(deviceBreakdown),
    browserBreakdown: mapToObj(browserBreakdown),
    languageBreakdown: mapToObj(languageBreakdown),
    countryBreakdown: mapToObj(countryBreakdown),
    stateBreakdown: mapToObj(stateBreakdown),
    topCustomEvents: mapToObj(topCustomEvents),
    topJsErrors: mapToObj(topJsErrors),
  };
}

export async function rollupDay(websiteId, dateStr) {
  await ensureAdminAuth();

  const dayStart = startOfDay(new Date(dateStr + "T00:00:00"));
  const dayEnd = endOfDay(dayStart);

  const { sessions, events, jsErrors } = await fetchRecordsForPeriod(websiteId, dayStart, dayEnd);
  const sessionEventsMap = buildSessionEventsMap(events);
  const metrics = calculateMetricsFromData(sessions, events, jsErrors, { skipBreakdowns: true, sessionEventsMap });
  const breakdowns = computeBreakdowns(sessions, events, sessionEventsMap);

  for (const error of jsErrors) {
    if (error.errorMessage) {
      const count = error.count || 1;
      breakdowns.topJsErrors[error.errorMessage] = (breakdowns.topJsErrors[error.errorMessage] || 0) + count;
    }
  }

  const bounceCount = sessions.length > 0 ? Math.round((metrics.bounceRate / 100) * sessions.length) : 0;

  let totalDurationMs = 0;
  for (const session of sessions) {
    const dur = new Date(session.updated) - new Date(session.created);
    if (dur > 0) totalDurationMs += dur;
  }

  const data = {
    website: websiteId,
    date: dateStr,
    visitors: metrics.visitors,
    newVisitors: metrics.newVisitors,
    pageViews: metrics.pageViews,
    engagedSessions: metrics.engagedSessions,
    bounceCount,
    totalDurationMs,
    jsErrorCount: metrics.jsErrors,
    breakdowns,
  };

  try {
    const existing = await pbAdmin.collection(COLLECTION).getFirstListItem(`website="${websiteId}" && date="${dateStr}"`, {
      fields: "id",
      $autoCancel: false,
    });
    await pbAdmin.collection(COLLECTION).update(existing.id, data);
    logger.debug("Updated daily_stats for %s on %s", websiteId, dateStr);
  } catch {
    await pbAdmin.collection(COLLECTION).create(data);
    logger.debug("Created daily_stats for %s on %s", websiteId, dateStr);
  }
}

export async function rollupYesterday() {
  await ensureAdminAuth();
  const yesterday = toDateString(subDays(new Date(), 1));

  const websites = await pbAdmin.collection("websites").getFullList({
    fields: "id,name",
    $autoCancel: false,
  });

  for (const website of websites) {
    try {
      await rollupDay(website.id, yesterday);
    } catch (error) {
      logger.error("Failed to rollup daily_stats for website %s on %s: %o", website.id, yesterday, error);
    }
  }
  logger.info("Daily rollup complete for %d websites on %s.", websites.length, yesterday);
}

export async function backfillWebsite(websiteId, days = 365) {
  const today = new Date();
  const todayStr = toDateString(today);

  for (let i = 1; i <= days; i++) {
    const dateStr = toDateString(subDays(today, i));

    try {
      await pbAdmin.collection(COLLECTION).getFirstListItem(`website="${websiteId}" && date="${dateStr}"`, {
        fields: "id",
        $autoCancel: false,
      });
      continue;
    } catch {}

    try {
      await rollupDay(websiteId, dateStr);
    } catch (error) {
      logger.error("Backfill failed for website %s on %s: %o", websiteId, dateStr, error);
    }
  }
  logger.info("Backfill complete for website %s (%d days).", websiteId, days);
}

export async function backfillAll(days = 365) {
  await ensureAdminAuth();
  const websites = await pbAdmin.collection("websites").getFullList({
    fields: "id,name",
    $autoCancel: false,
  });

  for (const website of websites) {
    logger.info("Backfilling daily_stats for website %s (%s)...", website.name, website.id);
    await backfillWebsite(website.id, days);
  }
  logger.info("Full backfill complete for %d websites.", websites.length);
}

export async function getDailyStats(websiteId, startDate, endDate) {
  const startStr = toDateString(startDate);
  const endStr = toDateString(endDate);
  const cacheKey = cacheService.key("dailyStats", websiteId, startStr, endStr);

  return cacheService.getOrCompute(cacheKey, cacheService.TTL.SESSIONS, async () => {
    await ensureAdminAuth();
    return pbAdmin.collection(COLLECTION).getFullList({
      filter: `website="${websiteId}" && date>="${startStr}" && date<="${endStr}"`,
      sort: "date",
      $autoCancel: false,
    });
  });
}

export async function getDailyStatsMulti(websiteIds, startDate, endDate) {
  const startStr = toDateString(startDate);
  const endStr = toDateString(endDate);

  const websiteFilter = websiteIds.map((id) => `website="${id}"`).join(" || ");
  const cacheKey = cacheService.key("dailyStatsMulti", websiteIds.join(","), startStr, endStr);

  return cacheService.getOrCompute(cacheKey, cacheService.TTL.SESSIONS, async () => {
    await ensureAdminAuth();
    return pbAdmin.collection(COLLECTION).getFullList({
      filter: `(${websiteFilter}) && date>="${startStr}" && date<="${endStr}"`,
      sort: "date",
      $autoCancel: false,
    });
  });
}

function processAndSort(map, total) {
  if (total === 0) return [];
  return Array.from(map.entries())
    .map(([key, count]) => ({
      key,
      count,
      percentage: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);
}

function mergeBreakdownMaps(rows) {
  const keys = ["topPages", "entryPages", "exitPages", "topReferrers", "deviceBreakdown", "browserBreakdown", "languageBreakdown", "countryBreakdown", "stateBreakdown", "topCustomEvents", "topJsErrors"];
  const merged = {};
  for (const key of keys) {
    merged[key] = new Map();
  }

  for (const row of rows) {
    const bd = row.breakdowns;
    if (!bd) continue;
    for (const key of keys) {
      const obj = bd[key];
      if (!obj) continue;
      const map = merged[key];
      for (const [k, v] of Object.entries(obj)) {
        map.set(k, (map.get(k) || 0) + v);
      }
    }
  }

  return merged;
}

export function aggregateStats(rows) {
  let visitors = 0;
  let newVisitors = 0;
  let pageViews = 0;
  let engagedSessions = 0;
  let bounceCount = 0;
  let totalDurationMs = 0;
  let jsErrorCount = 0;

  for (const row of rows) {
    visitors += row.visitors || 0;
    newVisitors += row.newVisitors || 0;
    pageViews += row.pageViews || 0;
    engagedSessions += row.engagedSessions || 0;
    bounceCount += row.bounceCount || 0;
    totalDurationMs += row.totalDurationMs || 0;
    jsErrorCount += row.jsErrorCount || 0;
  }

  const avgDurationSec = visitors > 0 ? Math.round(totalDurationMs / 1000 / visitors) : 0;
  const minutes = Math.floor(avgDurationSec / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (avgDurationSec % 60).toString().padStart(2, "0");
  const bounceRate = visitors > 0 ? Math.round((bounceCount / visitors) * 100) : 0;
  const engagementRate = visitors > 0 ? Math.round((engagedSessions / visitors) * 100) : 0;

  return {
    pageViews,
    visitors,
    newVisitors,
    returningVisitors: visitors - newVisitors,
    engagedSessions,
    engagementRate,
    avgSessionDuration: { formatted: `${minutes}:${seconds}`, raw: avgDurationSec },
    bounceRate,
    jsErrors: jsErrorCount,
  };
}

export function trendsFromRows(rows, dateRange) {
  const byDate = new Map();
  for (const row of rows) {
    const key = row.date;
    if (!byDate.has(key)) {
      byDate.set(key, { visitors: 0, newVisitors: 0, pageViews: 0, engagedSessions: 0, bounceCount: 0, totalDurationMs: 0, jsErrorCount: 0 });
    }
    const d = byDate.get(key);
    d.visitors += row.visitors || 0;
    d.newVisitors += row.newVisitors || 0;
    d.pageViews += row.pageViews || 0;
    d.engagedSessions += row.engagedSessions || 0;
    d.bounceCount += row.bounceCount || 0;
    d.totalDurationMs += row.totalDurationMs || 0;
    d.jsErrorCount += row.jsErrorCount || 0;
  }

  const trends = {
    pageViews: [],
    visitors: [],
    newVisitors: [],
    engagementRate: [],
    avgSessionDuration: [],
    bounceRate: [],
    jsErrors: [],
  };

  for (const dateStr of dateRange) {
    const d = byDate.get(dateStr) || { visitors: 0, newVisitors: 0, pageViews: 0, engagedSessions: 0, bounceCount: 0, totalDurationMs: 0, jsErrorCount: 0 };
    trends.pageViews.push(d.pageViews);
    trends.visitors.push(d.visitors);
    trends.newVisitors.push(d.newVisitors);
    trends.engagementRate.push(d.visitors > 0 ? Math.round((d.engagedSessions / d.visitors) * 100) : 0);
    trends.avgSessionDuration.push(d.visitors > 0 ? Math.round(d.totalDurationMs / 1000 / d.visitors) : 0);
    trends.bounceRate.push(d.visitors > 0 ? Math.round((d.bounceCount / d.visitors) * 100) : 0);
    trends.jsErrors.push(d.jsErrorCount);
  }

  return trends;
}

export function breakdownsToReports(rows, totalPageViews, totalVisitors, totalJsErrors, limit = 10) {
  const merged = mergeBreakdownMaps(rows);

  return {
    topPages: processAndSort(merged.topPages, totalPageViews).slice(0, limit),
    entryPages: processAndSort(merged.entryPages, totalVisitors).slice(0, limit),
    exitPages: processAndSort(merged.exitPages, totalVisitors).slice(0, limit),
    topReferrers: processAndSort(merged.topReferrers, totalVisitors).slice(0, limit),
    deviceBreakdown: processAndSort(merged.deviceBreakdown, totalVisitors).slice(0, limit),
    browserBreakdown: processAndSort(merged.browserBreakdown, totalVisitors).slice(0, limit),
    languageBreakdown: processAndSort(merged.languageBreakdown, totalVisitors).slice(0, limit),
    countryBreakdown: processAndSort(merged.countryBreakdown, totalVisitors),
    stateBreakdown: processAndSort(merged.stateBreakdown, totalVisitors).slice(0, limit),
    topCustomEvents: processAndSort(merged.topCustomEvents, totalVisitors).slice(0, limit),
    topJsErrors: processAndSort(merged.topJsErrors, totalJsErrors).slice(0, limit),
  };
}

export function breakdownsToAllData(rows, totalPageViews, totalVisitors, totalJsErrors, reportType) {
  const merged = mergeBreakdownMaps(rows);
  const totalsMap = {
    topPages: totalPageViews,
    entryPages: totalVisitors,
    exitPages: totalVisitors,
    topReferrers: totalVisitors,
    deviceBreakdown: totalVisitors,
    browserBreakdown: totalVisitors,
    languageBreakdown: totalVisitors,
    countryBreakdown: totalVisitors,
    stateBreakdown: totalVisitors,
    topCustomEvents: totalVisitors,
    topJsErrors: totalJsErrors,
  };

  const map = merged[reportType];
  if (!map) return [];
  const total = totalsMap[reportType] || 0;
  return processAndSort(map, total);
}
