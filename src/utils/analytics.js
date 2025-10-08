import { eachDayOfInterval, format } from "date-fns";
import { pb } from "../services/pocketbase.js";

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

export function aggregateSummaries(summaries) {
  let totalPageViews = 0;
  let totalVisitors = 0;
  let totalDurationSeconds = 0;
  let totalBouncedVisitors = 0;
  let finalizedVisitorsCount = 0;

  for (const day of summaries) {
    const s = day.summary;
    const dailyVisitors = s.visitors || 0;

    totalPageViews += s.pageViews || 0;
    totalVisitors += dailyVisitors;

    if (day.isFinalized && dailyVisitors > 0) {
      finalizedVisitorsCount += dailyVisitors;
      totalDurationSeconds += (s.avgSessionDuration?.raw || 0) * dailyVisitors;
      totalBouncedVisitors += ((s.bounceRate || 0) / 100) * dailyVisitors;
    }
  }

  const avgDurationSeconds = finalizedVisitorsCount > 0 ? totalDurationSeconds / finalizedVisitorsCount : 0;
  const roundedSeconds = Math.round(avgDurationSeconds);
  const minutes = Math.floor(roundedSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (roundedSeconds % 60).toString().padStart(2, "0");

  const bounceRate = finalizedVisitorsCount > 0 ? Math.round((totalBouncedVisitors / finalizedVisitorsCount) * 100) : 0;

  return {
    pageViews: totalPageViews,
    visitors: totalVisitors,
    avgSessionDuration: {
      formatted: `${minutes}:${seconds}`,
      raw: roundedSeconds,
    },
    bounceRate: bounceRate,
  };
}

function mergeAndSortReports(summaries, reportKey, limit) {
  const mergedMap = new Map();
  let total = 0;

  for (const day of summaries) {
    const reportList = day.summary?.[reportKey];
    if (reportList) {
      for (const item of reportList) {
        mergedMap.set(item.key, (mergedMap.get(item.key) || 0) + item.count);
      }
    }
  }

  for (const count of mergedMap.values()) {
    total += count;
  }

  return processAndSort(mergedMap, total).slice(0, limit);
}

export function getReportsFromSummaries(summaries, limit) {
  return {
    topPages: mergeAndSortReports(summaries, "topPages", limit),
    topReferrers: mergeAndSortReports(summaries, "topReferrers", limit),
    deviceBreakdown: mergeAndSortReports(summaries, "deviceBreakdown", limit),
    browserBreakdown: mergeAndSortReports(summaries, "browserBreakdown", limit),
    languageBreakdown: mergeAndSortReports(summaries, "languageBreakdown", limit),
    utmSourceBreakdown: mergeAndSortReports(summaries, "utmSourceBreakdown", limit),
    utmMediumBreakdown: mergeAndSortReports(summaries, "utmMediumBreakdown", limit),
    utmCampaignBreakdown: mergeAndSortReports(summaries, "utmCampaignBreakdown", limit),
    topCustomEvents: mergeAndSortReports(summaries, "topCustomEvents", limit),
  };
}

export function getAllData(summaries, reportType) {
  const keyMap = {
    topPages: "topPages",
    topReferrers: "topReferrers",
    deviceBreakdown: "deviceBreakdown",
    browserBreakdown: "browserBreakdown",
    languageBreakdown: "languageBreakdown",
    utmSourceBreakdown: "utmSourceBreakdown",
    utmMediumBreakdown: "utmMediumBreakdown",
    utmCampaignBreakdown: "utmCampaignBreakdown",
    topCustomEvents: "topCustomEvents",
  };
  const reportKey = keyMap[reportType];
  return reportKey ? mergeAndSortReports(summaries, reportKey, 10000) : [];
}

export function getChartDataFromSummaries(summaries, startDate, endDate) {
  const dateRange = eachDayOfInterval({ start: startDate, end: endDate });
  const pageViewCounts = new Map(dateRange.map((d) => [format(d, "yyyy-MM-dd"), 0]));

  for (const summary of summaries) {
    const summaryDateString = summary.date.substring(0, 10);
    if (pageViewCounts.has(summaryDateString)) {
      pageViewCounts.set(summaryDateString, pageViewCounts.get(summaryDateString) + (summary.summary?.pageViews || 0));
    }
  }

  const data = Array.from(pageViewCounts.entries())
    .map(([dateString, count]) => [new Date(dateString).getTime(), count])
    .sort((a, b) => a[0] - b[0]);

  return [{ name: "Page Views", data }];
}

export async function calculateActiveUsers(websiteId) {
  const date = new Date();
  date.setMinutes(date.getMinutes() - 5);
  const fiveMinutesAgoUTC = date.toISOString().slice(0, 19).replace("T", " ");

  const result = await pb.collection("sessions").getList(1, 1, {
    filter: `website.id = "${websiteId}" && updated >= "${fiveMinutesAgoUTC}"`,
    $autoCancel: false,
  });

  return result.totalItems;
}

export function calculatePercentageChange(current, previous, invert = false) {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  const change = ((current - previous) / previous) * 100;
  return Math.round(invert ? change * -1 : change);
}

export function calculateMetrics(sessions, events) {
  const getSessionEventCounts = (ev) => {
    const sessionEventCounts = new Map();
    for (const event of ev) {
      const count = sessionEventCounts.get(event.session) || 0;
      sessionEventCounts.set(event.session, count + 1);
    }
    return sessionEventCounts;
  };

  const calculateBounceRate = (sess, ev) => {
    if (sess.length === 0) return 0;
    const sessionEventCounts = getSessionEventCounts(ev);
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
    bounceRate: calculateBounceRate(sessions, events),
  };
}
