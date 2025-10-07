import { formatISO, startOfDay, endOfDay, subDays } from "date-fns";
import { pb } from "../services/pocketbase.js";
import { calculateMetrics, getReports, calculateActiveUsers } from "../utils/analytics.js";
import { generatePdfReport, generateCsvReport } from "../services/reportGenerator.js";

async function fetchAnalyticsData(websiteId, startDate, endDate) {
  const start = formatISO(startOfDay(startDate));
  const end = formatISO(endOfDay(endDate));
  const dateFilter = `created >= "${start}" && created <= "${end}"`;

  const sessions = await pb.collection("sessions").getFullList({
    filter: `website.id = "${websiteId}" && ${dateFilter}`,
    $autoCancel: false,
  });

  const events = await pb.collection("events").getFullList({
    filter: `session.website.id = "${websiteId}" && ${dateFilter}`,
    $autoCancel: false,
  });

  return { sessions, events };
}

export async function generateReport(req, res) {
  try {
    const { websiteId } = req.params;
    const path = req.path;
    const format = path.endsWith("/pdf") ? "pdf" : path.endsWith("/csv") ? "csv" : null;

    if (!format) {
      return res.status(400).send("Invalid report format specified.");
    }
    const userId = res.locals.user.id;

    const currentWebsite = await pb.collection("websites").getFirstListItem(`id="${websiteId}" && user.id="${userId}"`);

    if (!currentWebsite) {
      return res.status(404).send("Website not found or you do not have permission to view it.");
    }

    const dataPeriod = Number.parseInt(req.query.period) || 7;
    const today = new Date();
    const currentStartDate = subDays(today, dataPeriod - 1);
    const currentEndDate = today;

    const currentData = await fetchAnalyticsData(websiteId, currentStartDate, currentEndDate);
    const activeUsers = await calculateActiveUsers(websiteId);
    const metrics = calculateMetrics(currentData.sessions, currentData.events);
    const reports = getReports(currentData.sessions, currentData.events, {
      topPages: 10,
      topReferrers: 10,
      deviceBreakdown: 10,
      browserBreakdown: 10,
      languageBreakdown: 10,
      utmSourceBreakdown: 10,
      utmMediumBreakdown: 10,
      utmCampaignBreakdown: 10,
      topCustomEvents: 10,
    });

    const reportData = {
      currentWebsite,
      metrics,
      reports,
      activeUsers,
      period: `Data for the last ${dataPeriod} days (${currentStartDate.toLocaleDateString()} - ${currentEndDate.toLocaleDateString()})`,
    };

    if (format === "pdf") {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="report-${websiteId}.pdf"`);
      generatePdfReport(reportData, res);
    } else if (format === "csv") {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="report-${websiteId}.csv"`);
      generateCsvReport(reportData, res);
    }
  } catch (error) {
    console.error("Error generating report:", error);
    res.status(500).send("Failed to generate report.");
  }
}
