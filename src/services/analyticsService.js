import { eachDayOfInterval, subDays } from "date-fns";
import { pbAdmin, ensureAdminAuth } from "./pocketbase.js";
import logger from "../utils/logger.js";
import cacheService from "./cacheService.js";

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

function snapTo5Min(date) {
  const d = new Date(date);
  d.setUTCMinutes(Math.floor(d.getUTCMinutes() / 5) * 5, 0, 0);
  return d;
}

function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function buildSessionEventsMap(events) {
  const map = new Map();
  for (const event of events) {
    if (!map.has(event.session)) {
      map.set(event.session, []);
    }
    map.get(event.session).push(event);
  }
  return map;
}

export async function fetchRecordsForPeriod(websiteId, startDate, endDate) {
  const startISO = startDate.toISOString().replace("T", " ");
  const endISO = endDate.toISOString().replace("T", " ");

  const startKey = startISO.substring(0, 16);
  const endKey = snapTo5Min(endDate).toISOString().replace("T", " ").substring(0, 16);
  const cacheKey = cacheService.key("records", websiteId, startKey, endKey);

  const isPastPeriod = Date.now() - endDate.getTime() > 10 * 60 * 1000;
  const ttl = isPastPeriod ? cacheService.TTL.PAST_RECORDS : cacheService.TTL.SESSIONS;

  return cacheService.getOrCompute(cacheKey, ttl, async () => {
    logger.debug("Fetching records for website %s from %s to %s", websiteId, startISO, endISO);

    const [sessions, events, jsErrors] = await Promise.all([
      pbAdmin.collection("sessions").getFullList({
        filter: `website.id = "${websiteId}" && created >= "${startISO}" && created <= "${endISO}"`,
        sort: "created",
        fields: "id,created,updated,isNewVisitor,referrer,device,browser,language,country,state,entryPath,exitPath",
        $autoCancel: false,
      }),
      pbAdmin.collection("events").getFullList({
        filter: `session.website.id = "${websiteId}" && created >= "${startISO}" && created <= "${endISO}"`,
        sort: "created",
        fields: "id,session,type,path,eventName,eventData,created",
        $autoCancel: false,
      }),
      pbAdmin.collection("js_errors").getFullList({
        filter: `website.id = "${websiteId}" && created >= "${startISO}" && created <= "${endISO}"`,
        fields: "id,errorMessage,count,created",
        $autoCancel: false,
      }),
    ]);

    logger.debug("Fetched %d sessions, %d events, %d js_errors for website %s", sessions.length, events.length, jsErrors.length, websiteId);
    return { sessions, events, jsErrors };
  });
}

export async function calculateMetricsFromRecords(websiteId, startDate, endDate) {
  const { sessions, events, jsErrors } = await fetchRecordsForPeriod(websiteId, startDate, endDate);
  return calculateMetricsFromData(sessions, events, jsErrors);
}

const BREAKDOWN_KEYS = ["topPages", "entryPages", "exitPages", "topReferrers", "deviceBreakdown", "browserBreakdown", "languageBreakdown", "countryBreakdown", "stateBreakdown", "topCustomEvents", "topJsErrors"];

export function stripBreakdowns(metrics) {
  const clean = {};
  for (const key of Object.keys(metrics)) {
    if (!BREAKDOWN_KEYS.includes(key)) {
      clean[key] = metrics[key];
    }
  }
  return clean;
}

export function calculateMetricsFromData(sessions, events, jsErrors = [], options = {}) {
  const { skipBreakdowns = false, sessionEventsMap: providedMap = null } = options;
  const sessionEventsMap = providedMap || buildSessionEventsMap(events);

  const topPages = skipBreakdowns ? null : new Map();
  const entryPages = skipBreakdowns ? null : new Map();
  const exitPages = skipBreakdowns ? null : new Map();
  const topReferrers = skipBreakdowns ? null : new Map();
  const deviceBreakdown = skipBreakdowns ? null : new Map();
  const browserBreakdown = skipBreakdowns ? null : new Map();
  const languageBreakdown = skipBreakdowns ? null : new Map();
  const countryBreakdown = skipBreakdowns ? null : new Map();
  const stateBreakdown = skipBreakdowns ? null : new Map();
  const topCustomEvents = skipBreakdowns ? null : new Map();
  const topJsErrors = skipBreakdowns ? null : new Map();

  let newVisitors = 0;
  let returningVisitors = 0;
  let engagedSessions = 0;

  for (const session of sessions) {
    if (session.isNewVisitor) {
      newVisitors++;
    } else {
      returningVisitors++;
    }

    const sessionEvents = sessionEventsMap.get(session.id) || [];

    if (sessionEvents.length > 0) {
      sessionEvents.sort((a, b) => new Date(a.created) - new Date(b.created));

      if (!skipBreakdowns) {
        const firstEvent = sessionEvents[0];
        const lastEvent = sessionEvents[sessionEvents.length - 1];

        const entryPath = firstEvent.path || session.entryPath;
        if (entryPath) {
          entryPages.set(entryPath, (entryPages.get(entryPath) || 0) + 1);
        }

        const exitPath = lastEvent.path || session.exitPath;
        if (exitPath) {
          exitPages.set(exitPath, (exitPages.get(exitPath) || 0) + 1);
        }
      }

      let isEngaged = false;
      for (let i = 0; i < sessionEvents.length; i++) {
        const event = sessionEvents[i];
        if (!skipBreakdowns) {
          if (event.type === "pageView" && event.path) {
            topPages.set(event.path, (topPages.get(event.path) || 0) + 1);
          } else if (event.type === "custom" && event.eventName && event.eventName !== "exit") {
            topCustomEvents.set(event.eventName, (topCustomEvents.get(event.eventName) || 0) + 1);
          }
        }

        if (!isEngaged) {
          const duration = parseDuration(event.eventData?.duration);
          if (event.eventName === "exit") {
            if (duration !== null && duration > 10) {
              isEngaged = true;
            }
          } else if (i >= 1 || (duration !== null && duration > 10)) {
            isEngaged = true;
          }
        }
      }

      if (isEngaged) {
        engagedSessions++;
      }
    }

    if (!skipBreakdowns) {
      const referrerKey = normalizeReferrer(session.referrer);
      topReferrers.set(referrerKey, (topReferrers.get(referrerKey) || 0) + 1);

      deviceBreakdown.set(session.device || "Unknown", (deviceBreakdown.get(session.device || "Unknown") || 0) + 1);
      browserBreakdown.set(session.browser || "Unknown", (browserBreakdown.get(session.browser || "Unknown") || 0) + 1);
      languageBreakdown.set(session.language || "Unknown", (languageBreakdown.get(session.language || "Unknown") || 0) + 1);
      countryBreakdown.set(session.country || "Unknown", (countryBreakdown.get(session.country || "Unknown") || 0) + 1);
      stateBreakdown.set(`${session.country || "Unknown"}|${session.state || "Unknown"}`, (stateBreakdown.get(`${session.country || "Unknown"}|${session.state || "Unknown"}`) || 0) + 1);
    }
  }

  let totalJsErrors = 0;
  for (const error of jsErrors) {
    const count = error.count || 1;
    totalJsErrors += count;
    if (!skipBreakdowns && error.errorMessage) {
      topJsErrors.set(error.errorMessage, (topJsErrors.get(error.errorMessage) || 0) + count);
    }
  }

  const totalVisitors = sessions.length;
  const totalPageViews = events.filter((e) => e.type === "pageView").length;

  const metrics = calculateMetrics(sessions, events, sessionEventsMap);

  const engagementRate = totalVisitors > 0 ? Math.round((engagedSessions / totalVisitors) * 100) : 0;

  const result = {
    pageViews: totalPageViews,
    visitors: totalVisitors,
    newVisitors,
    returningVisitors,
    engagedSessions,
    engagementRate,
    avgSessionDuration: metrics.avgSessionDuration,
    bounceRate: metrics.bounceRate,
    jsErrors: totalJsErrors,
  };

  if (!skipBreakdowns) {
    result.topPages = processAndSort(topPages, totalPageViews);
    result.entryPages = processAndSort(entryPages, totalVisitors);
    result.exitPages = processAndSort(exitPages, totalVisitors);
    result.topReferrers = processAndSort(topReferrers, totalVisitors);
    result.deviceBreakdown = processAndSort(deviceBreakdown, totalVisitors);
    result.browserBreakdown = processAndSort(browserBreakdown, totalVisitors);
    result.languageBreakdown = processAndSort(languageBreakdown, totalVisitors);
    result.countryBreakdown = processAndSort(countryBreakdown, totalVisitors);
    result.stateBreakdown = processAndSort(stateBreakdown, totalVisitors);
    result.topCustomEvents = processAndSort(topCustomEvents, totalVisitors);
    result.topJsErrors = processAndSort(topJsErrors, totalJsErrors);
  }

  return result;
}

export function getMetricTrends(sessions, events, jsErrors = [], trendDays = 7, providedStartDate = null, providedEndDate = null, providedSessionEventsMap = null) {
  const trends = {
    pageViews: [],
    visitors: [],
    newVisitors: [],
    engagementRate: [],
    avgSessionDuration: [],
    bounceRate: [],
    jsErrors: [],
  };

  const endDate = providedEndDate ? new Date(providedEndDate) : new Date();
  endDate.setHours(23, 59, 59, 999);
  const startDate = providedStartDate ? new Date(providedStartDate) : subDays(endDate, trendDays - 1);
  startDate.setHours(0, 0, 0, 0);
  const dateRange = eachDayOfInterval({ start: startDate, end: endDate });

  const dailyData = new Map(
    dateRange.map((d) => [
      toDateString(d),
      {
        sessions: [],
        events: [],
        jsErrors: [],
      },
    ]),
  );

  const sessionEventsMap = providedSessionEventsMap || buildSessionEventsMap(events);
  for (const event of events) {
    const eventDateString = toDateString(new Date(event.created));
    if (dailyData.has(eventDateString)) {
      dailyData.get(eventDateString).events.push(event);
    }
  }

  for (const session of sessions) {
    const sessionDateString = toDateString(new Date(session.created));
    if (dailyData.has(sessionDateString)) {
      dailyData.get(sessionDateString).sessions.push(session);
    }
  }

  for (const error of jsErrors) {
    const errorDate = new Date(error.created || error.lastSeen);
    if (!isNaN(errorDate)) {
      const errorDateString = toDateString(errorDate);
      if (dailyData.has(errorDateString)) {
        dailyData.get(errorDateString).jsErrors.push(error);
      }
    }
  }

  for (const day of dateRange) {
    const dateString = toDateString(day);
    const data = dailyData.get(dateString);

    const daySessions = data.sessions;
    const dayEvents = data.events;
    const dayJsErrors = data.jsErrors;

    const pageViews = dayEvents.filter((e) => e.type === "pageView").length;
    const visitors = daySessions.length;
    const newVisitors = daySessions.filter((s) => s.isNewVisitor).length;
    const jsErrorsCount = dayJsErrors.reduce((sum, err) => sum + (err.count || 1), 0);

    let engagedSessions = 0;
    for (const session of daySessions) {
      const sessionEvents = sessionEventsMap.get(session.id) || [];
      let hasEngagement = false;
      for (let i = 0; i < sessionEvents.length; i++) {
        const event = sessionEvents[i];
        const duration = parseDuration(event.eventData?.duration);
        if (event.eventName === "exit") {
          if (duration !== null && duration > 10) {
            hasEngagement = true;
            break;
          }
        } else if (i >= 1 || (duration !== null && duration > 10)) {
          hasEngagement = true;
          break;
        }
      }
      if (hasEngagement) {
        engagedSessions++;
      }
    }

    const engagementRate = visitors > 0 ? Math.round((engagedSessions / visitors) * 100) : 0;

    const dayMetrics = calculateMetrics(daySessions, dayEvents, sessionEventsMap);
    const avgDurationSeconds = dayMetrics.avgSessionDuration.raw;
    const bounceRate = dayMetrics.bounceRate;

    trends.pageViews.push(pageViews);
    trends.visitors.push(visitors);
    trends.newVisitors.push(newVisitors);
    trends.engagementRate.push(engagementRate);
    trends.avgSessionDuration.push(avgDurationSeconds);
    trends.bounceRate.push(bounceRate);
    trends.jsErrors.push(jsErrorsCount);
  }

  return trends;
}

export async function calculateActiveUsers(websiteId) {
  const cacheKey = cacheService.key("activeUsers", websiteId);

  return cacheService.getOrCompute(cacheKey, cacheService.TTL.ACTIVE_USERS, async () => {
    const date = new Date();
    date.setMinutes(date.getMinutes() - 5);
    const fiveMinutesAgoUTC = date.toISOString().slice(0, 19).replace("T", " ");

    const result = await pbAdmin.collection("sessions").getList(1, 1, {
      filter: `website.id = "${websiteId}" && updated >= "${fiveMinutesAgoUTC}"`,
      fields: "id",
      $autoCancel: false,
    });

    return result.totalItems;
  });
}

export function calculatePercentageChange(current, previous) {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  const change = ((current - previous) / previous) * 100;
  return Math.round(change);
}

export function getReportsFromMetrics(metrics, limit) {
  return {
    topPages: metrics.topPages.slice(0, limit),
    entryPages: metrics.entryPages.slice(0, limit),
    exitPages: metrics.exitPages.slice(0, limit),
    topReferrers: metrics.topReferrers.slice(0, limit),
    deviceBreakdown: metrics.deviceBreakdown.slice(0, limit),
    browserBreakdown: metrics.browserBreakdown.slice(0, limit),
    languageBreakdown: metrics.languageBreakdown.slice(0, limit),
    countryBreakdown: metrics.countryBreakdown,
    stateBreakdown: metrics.stateBreakdown.slice(0, limit),
    topCustomEvents: metrics.topCustomEvents.slice(0, limit),
    topJsErrors: metrics.topJsErrors.slice(0, limit),
  };
}

export function getAllData(metrics, reportType) {
  const keyMap = {
    topPages: "topPages",
    entryPages: "entryPages",
    exitPages: "exitPages",
    topReferrers: "topReferrers",
    deviceBreakdown: "deviceBreakdown",
    browserBreakdown: "browserBreakdown",
    languageBreakdown: "languageBreakdown",
    countryBreakdown: "countryBreakdown",
    stateBreakdown: "stateBreakdown",
    topCustomEvents: "topCustomEvents",
    topJsErrors: "topJsErrors",
  };
  return metrics[keyMap[reportType]] || [];
}

export function calculateMetrics(sessions, events, sessionEventsMap = null) {
  const getSessionEventCounts = () => {
    if (sessionEventsMap) {
      const counts = new Map();
      for (const [sessionId, evts] of sessionEventsMap.entries()) {
        const filteredCount = evts.filter((e) => e.eventName !== "exit").length;
        counts.set(sessionId, filteredCount);
      }
      return counts;
    }
    const sessionEventCounts = new Map();
    for (const event of events) {
      if (event.eventName === "exit") continue;
      const count = sessionEventCounts.get(event.session) || 0;
      sessionEventCounts.set(event.session, count + 1);
    }
    return sessionEventCounts;
  };

  const calculateBounceRate = (sess) => {
    if (sess.length === 0) return 0;
    const sessionEventCounts = getSessionEventCounts();
    let bouncedSessions = 0;
    for (const session of sess) {
      if (sessionEventCounts.get(session.id) === 1) {
        bouncedSessions++;
      }
    }
    return Math.round((bouncedSessions / sess.length) * 100);
  };

  const calculateAverageSessionDuration = (sess) => {
    if (sess.length === 0) return { formatted: "00:00", raw: 0 };
    let totalDuration = 0;
    for (const session of sess) {
      const startTime = new Date(session.created);
      const endTime = new Date(session.updated);
      const duration = endTime - startTime;
      if (duration > 0) totalDuration += duration;
    }
    const avgDurationInSeconds = totalDuration > 0 ? totalDuration / 1000 / sess.length : 0;
    const roundedSeconds = Math.round(avgDurationInSeconds);
    const minutes = Math.floor(roundedSeconds / 60)
      .toString()
      .padStart(2, "0");
    const seconds = (roundedSeconds % 60).toString().padStart(2, "0");
    return { formatted: `${minutes}:${seconds}`, raw: roundedSeconds };
  };

  return {
    avgSessionDuration: calculateAverageSessionDuration(sessions),
    bounceRate: calculateBounceRate(sessions),
  };
}

export async function fetchSessions(websiteId, startDate, endDate) {
  const startKey = startDate.toISOString().substring(0, 16).replace("T", " ");
  const endKey = snapTo5Min(endDate).toISOString().replace("T", " ").substring(0, 16);
  const cacheKey = cacheService.key("sessions", websiteId, startKey, endKey);

  const isPastPeriod = Date.now() - endDate.getTime() > 10 * 60 * 1000;
  const ttl = isPastPeriod ? cacheService.TTL.PAST_RECORDS : cacheService.TTL.SESSIONS;

  return cacheService.getOrCompute(cacheKey, ttl, async () => {
    logger.debug("Fetching sessions for website %s from %s to %s", websiteId, startDate.toISOString(), endDate.toISOString());
    await ensureAdminAuth();

    const startISO = startDate.toISOString().replace("T", " ");
    const endISO = endDate.toISOString().replace("T", " ");

    const sessions = await pbAdmin.collection("sessions").getFullList({
      filter: `website.id = "${websiteId}" && created >= "${startISO}" && created <= "${endISO}"`,
      sort: "created",
      fields: "id,created,updated,isNewVisitor,referrer,device,browser,language,country,state,entryPath,exitPath",
      $autoCancel: false,
    });

    logger.debug("Found %d sessions for website %s", sessions.length, websiteId);
    return sessions;
  });
}

export async function fetchEvents(websiteId, startDate, endDate) {
  const startKey = startDate.toISOString().substring(0, 16).replace("T", " ");
  const endKey = snapTo5Min(endDate).toISOString().replace("T", " ").substring(0, 16);
  const cacheKey = cacheService.key("events", websiteId, startKey, endKey);

  const isPastPeriod = Date.now() - endDate.getTime() > 10 * 60 * 1000;
  const ttl = isPastPeriod ? cacheService.TTL.PAST_RECORDS : cacheService.TTL.SESSIONS;

  return cacheService.getOrCompute(cacheKey, ttl, async () => {
    logger.debug("Fetching events for website %s from %s to %s", websiteId, startDate.toISOString(), endDate.toISOString());
    await ensureAdminAuth();

    const startISO = startDate.toISOString().replace("T", " ");
    const endISO = endDate.toISOString().replace("T", " ");

    const events = await pbAdmin.collection("events").getFullList({
      filter: `session.website.id = "${websiteId}" && created >= "${startISO}" && created <= "${endISO}"`,
      sort: "created",
      fields: "id,session,type,path,eventName,eventData,created",
      $autoCancel: false,
    });

    logger.debug("Found %d events for website %s", events.length, websiteId);
    return events;
  });
}
