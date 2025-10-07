import { formatISO, subMinutes, eachDayOfInterval } from "date-fns";
import { pb } from "../services/pocketbase.js";

function getSessionEventCounts(events) {
  const sessionEventCounts = new Map();
  for (const event of events) {
    const count = sessionEventCounts.get(event.session) || 0;
    sessionEventCounts.set(event.session, count + 1);
  }
  return sessionEventCounts;
}

function processAndSort(map, total) {
  if (total === 0) return [];
  return Array.from(map.entries())
    .map(([key, value]) => ({
      key,
      count: value,
      percentage: Math.round((value / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);
}

function calculatePageViews(events) {
  let count = 0;
  for (const event of events) {
    if (event.type === "pageView") {
      count++;
    }
  }
  return count;
}

function calculateUniqueVisitors(sessions) {
  const uniqueVisitorIds = new Set();
  for (const session of sessions) {
    uniqueVisitorIds.add(session.visitor);
  }
  return uniqueVisitorIds.size;
}

function calculateAverageSessionDuration(sessions) {
  if (sessions.length === 0) {
    return { formatted: "00:00", raw: 0 };
  }

  let totalDuration = 0;
  for (const session of sessions) {
    const startTime = new Date(session.created);
    const endTime = new Date(session.updated);
    const duration = endTime - startTime;
    if (duration > 0) {
      totalDuration += duration;
    }
  }

  const avgDurationInSeconds = totalDuration > 0 ? totalDuration / 1000 / sessions.length : 0;
  const roundedSeconds = Math.round(avgDurationInSeconds);

  const minutes = Math.floor(roundedSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (roundedSeconds % 60).toString().padStart(2, "0");

  return { formatted: `${minutes}:${seconds}`, raw: roundedSeconds };
}

function calculateBounceRate(sessions, events) {
  if (sessions.length === 0) {
    return 0;
  }

  const sessionEventCounts = getSessionEventCounts(events);
  let bouncedSessions = 0;

  for (const session of sessions) {
    if (sessionEventCounts.get(session.id) === 1) {
      bouncedSessions++;
    }
  }

  const bounceRate = (bouncedSessions / sessions.length) * 100;
  return Math.round(bounceRate);
}

function getTopPages(events, limit) {
  const pageCounts = new Map();
  let total = 0;
  for (const event of events) {
    if (event.type === "pageView" && event.path) {
      pageCounts.set(event.path, (pageCounts.get(event.path) || 0) + 1);
      total++;
    }
  }
  return processAndSort(pageCounts, total).slice(0, limit);
}

function getTopReferrers(sessions, limit) {
  const referrerCounts = new Map();
  let total = 0;
  for (const session of sessions) {
    let referrerHost = "Direct";
    if (session.referrer) {
      try {
        referrerHost = new URL(session.referrer).hostname.replace("www.", "");
      } catch (e) {
        referrerHost = session.referrer;
      }
    }
    referrerCounts.set(referrerHost, (referrerCounts.get(referrerHost) || 0) + 1);
    total++;
  }
  return processAndSort(referrerCounts, total).slice(0, limit);
}

function getTopCustomEvents(events, limit) {
  const eventCounts = new Map();
  let total = 0;
  for (const event of events) {
    if (event.type === "custom" && event.eventName) {
      eventCounts.set(event.eventName, (eventCounts.get(event.eventName) || 0) + 1);
      total++;
    }
  }
  return processAndSort(eventCounts, total).slice(0, limit);
}

function getBreakdown(sessions, key, limit) {
  const counts = new Map();
  for (const session of sessions) {
    const value = session[key] || "Unknown";
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return processAndSort(counts, sessions.length).slice(0, limit);
}

function getUTMBreakdown(sessions, key, limit) {
  const utmCounts = new Map();
  let total = 0;
  for (const session of sessions) {
    if (session[key]) {
      utmCounts.set(session[key], (utmCounts.get(session[key]) || 0) + 1);
      total++;
    }
  }
  return processAndSort(utmCounts, total).slice(0, limit);
}

export async function calculateActiveUsers(websiteId) {
  const fiveMinutesAgo = formatISO(subMinutes(new Date(), 5));

  const events = await pb.collection("events").getFullList({
    filter: `session.website.id = "${websiteId}" && created >= "${fiveMinutesAgo}"`,
    $autoCancel: false,
  });

  const uniqueSessions = new Set();
  for (const event of events) {
    uniqueSessions.add(event.session);
  }

  return uniqueSessions.size;
}

export function calculateMetrics(sessions, events) {
  return {
    pageViews: calculatePageViews(events),
    visitors: calculateUniqueVisitors(sessions),
    avgSessionDuration: calculateAverageSessionDuration(sessions),
    bounceRate: calculateBounceRate(sessions, events),
  };
}

export function getReports(sessions, events, limits) {
  return {
    topPages: getTopPages(events, limits.topPages),
    topReferrers: getTopReferrers(sessions, limits.topReferrers),
    deviceBreakdown: getBreakdown(sessions, "device", limits.deviceBreakdown),
    browserBreakdown: getBreakdown(sessions, "browser", limits.browserBreakdown),
    languageBreakdown: getBreakdown(sessions, "language", limits.languageBreakdown),
    utmSourceBreakdown: getUTMBreakdown(sessions, "utmSource", limits.utmSourceBreakdown),
    utmMediumBreakdown: getUTMBreakdown(sessions, "utmMedium", limits.utmMediumBreakdown),
    utmCampaignBreakdown: getUTMBreakdown(sessions, "utmCampaign", limits.utmCampaignBreakdown),
    topCustomEvents: getTopCustomEvents(events, limits.topCustomEvents),
  };
}

export function getAllData(sessions, events, type) {
  switch (type) {
    case "topPages":
      return getTopPages(events, 10000);
    case "topReferrers":
      return getTopReferrers(sessions, 10000);
    case "deviceBreakdown":
      return getBreakdown(sessions, "device", 10000);
    case "browserBreakdown":
      return getBreakdown(sessions, "browser", 10000);
    case "languageBreakdown":
      return getBreakdown(sessions, "language", 10000);
    case "utmSourceBreakdown":
      return getUTMBreakdown(sessions, "utmSource", 10000);
    case "utmMediumBreakdown":
      return getUTMBreakdown(sessions, "utmMedium", 10000);
    case "utmCampaignBreakdown":
      return getUTMBreakdown(sessions, "utmCampaign", 10000);
    case "topCustomEvents":
      return getTopCustomEvents(events, 10000);
    default:
      return [];
  }
}

export function generateTimeseries(events, startDate, endDate) {
  const dateRange = eachDayOfInterval({ start: startDate, end: endDate });
  const pageViewCounts = new Map(dateRange.map((d) => [d.getTime(), 0]));

  for (const event of events) {
    if (event.type === "pageView") {
      const eventDay = new Date(event.created);
      eventDay.setHours(0, 0, 0, 0);
      const eventTimestamp = eventDay.getTime();
      if (pageViewCounts.has(eventTimestamp)) {
        pageViewCounts.set(eventTimestamp, pageViewCounts.get(eventTimestamp) + 1);
      }
    }
  }

  const data = Array.from(pageViewCounts.entries()).sort((a, b) => a[0] - b[0]);
  return [{ name: "Page Views", data }];
}

export function calculatePercentageChange(current, previous, invert = false) {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  const change = ((current - previous) / previous) * 100;
  return Math.round(invert ? change * -1 : change);
}
