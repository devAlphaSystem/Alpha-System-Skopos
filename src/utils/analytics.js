import { eachDayOfInterval, format, subDays } from "date-fns";
import { pbAdmin } from "../services/pocketbase.js";

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
  let totalNewVisitors = 0;
  let totalReturningVisitors = 0;
  let totalEngagedSessions = 0;
  let totalDurationSeconds = 0;
  let finalizedVisitorsCount = 0;
  let totalJsErrors = 0;

  for (const day of summaries) {
    const s = day.summary;
    const dailyVisitors = s.visitors || 0;

    totalPageViews += s.pageViews || 0;
    totalVisitors += dailyVisitors;
    totalNewVisitors += s.newVisitors || 0;
    totalReturningVisitors += s.returningVisitors || 0;
    totalEngagedSessions += s.engagedSessions || 0;
    totalJsErrors += s.jsErrors || 0;

    if (day.isFinalized && dailyVisitors > 0) {
      finalizedVisitorsCount += dailyVisitors;
      totalDurationSeconds += (s.avgSessionDuration?.raw || 0) * dailyVisitors;
    }
  }

  const avgDurationSeconds = finalizedVisitorsCount > 0 ? totalDurationSeconds / finalizedVisitorsCount : 0;
  const roundedSeconds = Math.round(avgDurationSeconds);
  const minutes = Math.floor(roundedSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (roundedSeconds % 60).toString().padStart(2, "0");

  const engagementRate = totalVisitors > 0 ? Math.round((totalEngagedSessions / totalVisitors) * 100) : 0;

  return {
    pageViews: totalPageViews,
    visitors: totalVisitors,
    newVisitors: totalNewVisitors,
    returningVisitors: totalReturningVisitors,
    engagementRate: engagementRate,
    avgSessionDuration: {
      formatted: `${minutes}:${seconds}`,
      raw: roundedSeconds,
    },
    jsErrors: totalJsErrors,
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
    entryPages: mergeAndSortReports(summaries, "entryPages", limit),
    exitPages: mergeAndSortReports(summaries, "exitPages", limit),
    topReferrers: mergeAndSortReports(summaries, "topReferrers", limit),
    deviceBreakdown: mergeAndSortReports(summaries, "deviceBreakdown", limit),
    browserBreakdown: mergeAndSortReports(summaries, "browserBreakdown", limit),
    languageBreakdown: mergeAndSortReports(summaries, "languageBreakdown", limit),
    countryBreakdown: mergeAndSortReports(summaries, "countryBreakdown", 1000),
    stateBreakdown: mergeAndSortReports(summaries, "stateBreakdown", 10000),
    topCustomEvents: mergeAndSortReports(summaries, "topCustomEvents", limit),
    topJsErrors: mergeAndSortReports(summaries, "topJsErrors", limit),
  };
}

export function getAllData(summaries, reportType) {
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
  const reportKey = keyMap[reportType];
  return reportKey ? mergeAndSortReports(summaries, reportKey, 10000) : [];
}

export function getMetricTrends(summaries, trendDays = 7) {
  const trends = {
    pageViews: [],
    visitors: [],
    engagementRate: [],
    avgSessionDuration: [],
  };

  const endDate = new Date();
  const startDate = subDays(endDate, trendDays - 1);
  const dateRange = eachDayOfInterval({ start: startDate, end: endDate });

  const dailyData = new Map(
    dateRange.map((d) => [
      format(d, "yyyy-MM-dd"),
      {
        pageViews: 0,
        visitors: 0,
        engagedSessions: 0,
        totalDurationSeconds: 0,
        finalizedVisitorsCount: 0,
      },
    ]),
  );

  for (const summary of summaries) {
    const summaryDateString = summary.date.substring(0, 10);
    if (dailyData.has(summaryDateString)) {
      const dayData = dailyData.get(summaryDateString);
      const s = summary.summary;
      const dailyVisitors = s.visitors || 0;

      dayData.pageViews += s.pageViews || 0;
      dayData.visitors += dailyVisitors;
      dayData.engagedSessions += s.engagedSessions || 0;
      if (summary.isFinalized && dailyVisitors > 0) {
        dayData.finalizedVisitorsCount += dailyVisitors;
        dayData.totalDurationSeconds += (s.avgSessionDuration?.raw || 0) * dailyVisitors;
      }
    }
  }

  for (const day of dateRange) {
    const dateString = format(day, "yyyy-MM-dd");
    const data = dailyData.get(dateString);

    const engagementRate = data.visitors > 0 ? Math.round((data.engagedSessions / data.visitors) * 100) : 0;
    const avgDurationSeconds = data.finalizedVisitorsCount > 0 ? data.totalDurationSeconds / data.finalizedVisitorsCount : 0;

    trends.pageViews.push(data.pageViews);
    trends.visitors.push(data.visitors);
    trends.engagementRate.push(engagementRate);
    trends.avgSessionDuration.push(Math.round(avgDurationSeconds));
  }

  return trends;
}

export async function calculateActiveUsers(websiteId) {
  const date = new Date();
  date.setMinutes(date.getMinutes() - 5);
  const fiveMinutesAgoUTC = date.toISOString().slice(0, 19).replace("T", " ");

  const result = await pbAdmin.collection("sessions").getList(1, 1, {
    filter: `website.id = "${websiteId}" && updated >= "${fiveMinutesAgoUTC}"`,
    $autoCancel: false,
  });

  return result.totalItems;
}

export function calculatePercentageChange(current, previous) {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  const change = ((current - previous) / previous) * 100;
  return Math.round(change);
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
