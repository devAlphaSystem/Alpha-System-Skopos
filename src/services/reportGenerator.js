import PDFDocument from "pdfkit";
import { stringify } from "csv-stringify";

function generateHeader(doc, reportData) {
  doc.fontSize(20).text(`Analytics Report for ${reportData.currentWebsite.name}`, { align: "center" });
  doc.fontSize(12).text(reportData.period, { align: "center" });
  doc.moveDown(2);
}

function generateMetrics(doc, reportData) {
  doc.fontSize(16).text("Key Metrics", { underline: true });
  doc.moveDown();

  const metrics = [`Page Views: ${reportData.metrics.pageViews}`, `Visitors: ${reportData.metrics.visitors}`, `Bounce Rate: ${reportData.metrics.bounceRate}%`, `Avg. Session: ${reportData.metrics.avgSessionDuration.formatted}`, `Active Users (now): ${reportData.activeUsers}`];

  doc.fontSize(12).list(metrics);
  doc.moveDown(2);
}

function generateReportSection(doc, title, data) {
  if (!data || data.length === 0) return;

  if (doc.y > doc.page.height - 200) {
    doc.addPage();
  }

  doc.fontSize(16).text(title, { underline: true });
  doc.moveDown();

  const startX = doc.page.margins.left;
  let startY = doc.y;
  const colWidths = [250, 100, 100];

  doc.font("Helvetica-Bold").fontSize(10);
  doc.text("Item", startX, startY, { width: colWidths[0], continued: false });
  doc.text("Count", startX + colWidths[0], startY, { width: colWidths[1], continued: false });
  doc.text("Percentage", startX + colWidths[0] + colWidths[1], startY, { width: colWidths[2], continued: false });

  doc.font("Helvetica").fontSize(9);
  startY += 20;

  for (const row of data) {
    if (startY > doc.page.height - 80) {
      doc.addPage();
      startY = doc.page.margins.top;
    }

    const itemText = String(row.key).substring(0, 40);
    doc.text(itemText, startX, startY, { width: colWidths[0], continued: false });
    doc.text(String(row.count), startX + colWidths[0], startY, { width: colWidths[1], continued: false });
    doc.text(`${row.percentage}%`, startX + colWidths[0] + colWidths[1], startY, { width: colWidths[2], continued: false });

    startY += 18;
  }

  doc.y = startY;
  doc.moveDown(1);
}

export function generatePdfReport(reportData, stream) {
  const doc = new PDFDocument({ margin: 50, bufferPages: true });
  doc.pipe(stream);

  generateHeader(doc, reportData);
  generateMetrics(doc, reportData);

  generateReportSection(doc, "Top Pages", reportData.reports.topPages);
  generateReportSection(doc, "Top Referrers", reportData.reports.topReferrers);
  generateReportSection(doc, "Devices", reportData.reports.deviceBreakdown);
  generateReportSection(doc, "Browsers", reportData.reports.browserBreakdown);
  generateReportSection(doc, "Languages", reportData.reports.languageBreakdown);
  generateReportSection(doc, "UTM Sources", reportData.reports.utmSourceBreakdown);
  generateReportSection(doc, "UTM Mediums", reportData.reports.utmMediumBreakdown);
  generateReportSection(doc, "UTM Campaigns", reportData.reports.utmCampaignBreakdown);
  generateReportSection(doc, "Custom Events", reportData.reports.topCustomEvents);

  doc.end();
}

export function generateCsvReport(reportData, stream) {
  const csvData = [];

  csvData.push(["Report for", reportData.currentWebsite.name]);
  csvData.push(["Period", reportData.period]);
  csvData.push([]);

  csvData.push(["Key Metrics"]);
  csvData.push(["Page Views", reportData.metrics.pageViews]);
  csvData.push(["Visitors", reportData.metrics.visitors]);
  csvData.push(["Bounce Rate (%)", reportData.metrics.bounceRate]);
  csvData.push(["Avg. Session (mm:ss)", reportData.metrics.avgSessionDuration.formatted]);
  csvData.push(["Active Users", reportData.activeUsers]);
  csvData.push([]);

  const reportSections = {
    "Top Pages": reportData.reports.topPages,
    "Top Referrers": reportData.reports.topReferrers,
    Devices: reportData.reports.deviceBreakdown,
    Browsers: reportData.reports.browserBreakdown,
    Languages: reportData.reports.languageBreakdown,
    "UTM Sources": reportData.reports.utmSourceBreakdown,
    "UTM Mediums": reportData.reports.utmMediumBreakdown,
    "UTM Campaigns": reportData.reports.utmCampaignBreakdown,
    "Custom Events": reportData.reports.topCustomEvents,
  };

  for (const [title, data] of Object.entries(reportSections)) {
    if (data && data.length > 0) {
      csvData.push([title]);
      csvData.push(["Item", "Count", "Percentage (%)"]);
      for (const item of data) {
        csvData.push([item.key, item.count, item.percentage]);
      }
      csvData.push([]);
    }
  }

  stringify(csvData, (err, output) => {
    if (err) {
      console.error("Error stringifying CSV:", err);
      stream.end();
      return;
    }
    stream.write(output);
    stream.end();
  });
}
