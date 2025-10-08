import { formatISO, startOfDay, endOfDay, subDays } from "date-fns";
import { pb } from "../services/pocketbase.js";
import { aggregateSummaries, getReportsFromSummaries, calculateActiveUsers } from "../utils/analytics.js";
import { generatePdfReport, generateCsvReport } from "../services/reportGenerator.js";

async function fetchSummaries(websiteId, startDate, endDate) {
  const start = formatISO(startOfDay(startDate), { representation: "date" });
  const end = formatISO(endOfDay(endDate), { representation: "date" });
  const dateFilter = `date >= "${start}" && date <= "${end}"`;

  const summaries = await pb.collection("dash_sum").getFullList({
    filter: `website.id = "${websiteId}" && ${dateFilter}`,
  });
  return summaries;
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

    const currentSummaries = await fetchSummaries(websiteId, currentStartDate, currentEndDate);
    const activeUsers = await calculateActiveUsers(websiteId);
    const metrics = aggregateSummaries(currentSummaries);
    const reports = getReportsFromSummaries(currentSummaries, 10);

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
