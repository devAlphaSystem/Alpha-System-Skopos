import { pbAdmin } from "./pocketbase.js";

function filterActiveWebsites(websites = []) {
  return websites.filter((website) => !website?.isArchived);
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeList(items = [], limit = 3) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const limited = items.slice(0, limit);
  const total = limited.reduce((sum, item) => sum + toNumber(item?.count), 0);

  return limited.map((item) => {
    const count = toNumber(item?.count);
    return {
      label: item?.key || item?.label || "Unknown",
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : null,
    };
  });
}

export function createDailySummaryEventData(website, summary = {}, extra = {}) {
  const visitors = toNumber(summary.visitors);
  const newVisitors = toNumber(summary.newVisitors);
  const returningVisitors = summary.returningVisitors !== undefined ? toNumber(summary.returningVisitors) : Math.max(0, visitors - newVisitors);
  const rawSessions = summary.sessions !== undefined ? toNumber(summary.sessions) : 0;
  const engagedSessions = summary.engagedSessions !== undefined ? toNumber(summary.engagedSessions) : rawSessions;
  const sessions = rawSessions || engagedSessions;
  const engagementRate = visitors > 0 ? Math.round((engagedSessions / visitors) * 100) : 0;
  const bounceRate = typeof summary.bounceRate === "number" ? Math.round(summary.bounceRate) : null;
  const avgSessionDuration = typeof summary.avgSessionDuration === "object" ? summary.avgSessionDuration?.formatted : summary.avgSessionDuration;

  return {
    websiteName: website?.name || "Your Website",
    reportDate: extra.reportDate || null,
    pageViews: toNumber(summary.pageViews),
    uniqueVisitors: visitors,
    newVisitors,
    returningVisitors,
    sessions,
    engagedSessions,
    engagementRate,
    bounceRate,
    avgSessionDuration: avgSessionDuration || "00:00",
    avgSessionDurationRaw: typeof summary.avgSessionDuration === "object" ? summary.avgSessionDuration?.raw : null,
    jsErrors: toNumber(summary.jsErrors),
    topPages: normalizeList(summary.topPages),
    topReferrers: normalizeList(summary.topReferrers),
    deviceBreakdown: normalizeList(summary.deviceBreakdown),
  };
}

export async function resolveRuleWebsites(rule) {
  const websiteField = rule.website;
  const websiteIds = Array.isArray(websiteField) ? websiteField : websiteField ? [websiteField] : [];
  const expandedWebsites = Array.isArray(rule.expand?.website) ? rule.expand.website : rule.expand?.website ? [rule.expand.website] : [];
  const expandedActive = filterActiveWebsites(expandedWebsites);
  const fields = "id,name,isArchived";

  if (websiteIds.length === 0) {
    if (!rule.user) {
      return [];
    }

    const websites = await pbAdmin.collection("websites").getFullList({
      filter: `user = "${rule.user}" && (isArchived = false || isArchived = null)`,
      fields,
    });
    return websites;
  }

  if (expandedActive.length === websiteIds.length) {
    return expandedActive;
  }

  const idFilter = websiteIds.map((id) => `id = "${id}"`).join(" || ");
  const filter = `(${idFilter}) && (isArchived = false || isArchived = null)`;

  const websites = await pbAdmin.collection("websites").getFullList({
    filter,
    fields,
  });

  return websites;
}
