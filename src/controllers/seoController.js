import { pbAdmin, ensureAdminAuth } from "../services/pocketbase.js";
import { analyzeSeo, calculateSeoScore } from "../services/seoAnalyzer.js";
import logger from "../utils/logger.js";

function truncate(value, length = 80) {
  if (!value) return value;
  return value.length > length ? `${value.slice(0, length)}...` : value;
}

function processSeoDataForView(seoData) {
  const metaTags = seoData.metaTags || {};
  const technical = seoData.technicalSeo || {};
  const images = seoData.images || {};
  const links = seoData.links || {};
  const headings = seoData.headings || {};
  const social = seoData.socialMetaTags || {};
  const performance = seoData.performanceScores ?? null;

  const metaFields = ["title", "description", "viewport", "canonical", "robots", "charset"];
  const metaAvailable = metaFields.filter((field) => metaTags[field]);
  const metaCoverage = Math.round((metaAvailable.length / metaFields.length) * 100);

  const altCoverage = images.total ? Math.round(((images.withAlt || 0) / images.total) * 100) : null;

  const h1Count = (headings.h1 || []).length;
  const h2Count = (headings.h2 || []).length;
  const h3Count = (headings.h3 || []).length;

  const seoScore = calculateSeoScore(seoData);
  const clampScore = Math.min(Math.max(seoScore, 0), 100);
  const scoreDescriptor = clampScore >= 90 ? "Excellent" : clampScore >= 75 ? "Strong" : clampScore >= 60 ? "Good" : clampScore >= 45 ? "Needs Work" : "Critical";

  const hasPerformanceScores = performance && performance.performance !== null && performance.performance !== undefined;
  const strategyLabel = hasPerformanceScores ? (performance.strategy ? performance.strategy.toUpperCase() : "MOBILE") : null;

  const scoreRadius = 98;
  const scoreCircumference = 2 * Math.PI * scoreRadius;
  const gaugeDashArray = scoreCircumference.toFixed(2);
  const gaugeDashOffset = (scoreCircumference - (scoreCircumference * clampScore) / 100).toFixed(2);

  const heroIntro = metaTags.description ? truncate(metaTags.description, 140) : "Review the most important technical and content signals in one place.";

  const recommendations = seoData.recommendations || [];
  const criticalIssues = recommendations.filter((r) => r.priority === "critical");
  const highPriorityIssues = recommendations.filter((r) => r.priority === "high");
  const mediumPriorityIssues = recommendations.filter((r) => r.priority === "medium");

  const opportunities = [];
  if (!metaTags.title) opportunities.push("Add a descriptive <title> tag that includes a primary keyword.");
  if (!metaTags.description) opportunities.push("Write a compelling meta description (50-160 characters).");
  if (!metaTags.canonical) opportunities.push("Define a canonical URL to prevent duplicate content issues.");
  if (!technical.hasSitemap) opportunities.push("Provide a sitemap.xml to help crawlers discover your pages.");
  if (!technical.hasRobotsTxt) opportunities.push("Add a robots.txt file to control crawler access.");
  if (images.total && images.withoutAlt) opportunities.push(`Add alt text to the ${images.withoutAlt} images missing descriptions.`);
  if (h1Count !== 1) opportunities.push("Ensure exactly one H1 heading exists on the page.");
  if (!technical.hasStructuredData) opportunities.push("Implement structured data (JSON-LD) for richer search results.");
  if (!technical.mobileResponsive) opportunities.push("Optimize the viewport for mobile devices.");
  if (!technical.hasSSL) opportunities.push("Serve the site over HTTPS to avoid browser warnings.");
  if (!technical.compression) opportunities.push("Enable gzip or brotli compression for faster delivery.");
  const legacyRecommendations = [...new Set(opportunities)].slice(0, 6);

  const highlightItems = [metaCoverage >= 80 ? `Meta coverage is ${metaCoverage}%` : null, typeof altCoverage === "number" ? `Image alt text coverage at ${altCoverage}%` : null, (links.total || 0) > 0 ? `${links.internal || 0} internal links and ${links.external || 0} external links detected` : null, technical.hasSSL ? "HTTPS is enabled" : null, technical.hasSitemap ? "Sitemap.xml is accessible" : null, technical.hasStructuredData ? "Structured data snippets found" : null].filter(Boolean).slice(0, 4);

  const metaStatusRows = [
    {
      label: "Title Tag",
      ok: Boolean(metaTags.title),
      detail: metaTags.title ? `${metaTags.title.length} characters` : "Missing",
      icon: "heading",
      importance: "critical",
    },
    {
      label: "Meta Description",
      ok: Boolean(metaTags.description),
      detail: metaTags.description ? `${metaTags.description.length} characters` : "Missing",
      icon: "align-left",
      importance: "critical",
    },
    {
      label: "Meta Keywords",
      ok: Boolean(metaTags.keywords),
      detail: metaTags.keywords ? "Configured" : "Optional tag",
      icon: "hashtag",
      importance: "optional",
    },
    {
      label: "Viewport",
      ok: Boolean(metaTags.viewport),
      detail: metaTags.viewport ? "Responsive" : "Missing",
      icon: "mobile-screen-button",
      importance: "critical",
    },
    {
      label: "Canonical URL",
      ok: Boolean(metaTags.canonical),
      detail: metaTags.canonical ? truncate(metaTags.canonical, 60) : "Not set",
      icon: "link",
      importance: "recommended",
    },
    {
      label: "Robots Directive",
      ok: Boolean(metaTags.robots),
      detail: metaTags.robots || "Not set",
      icon: "shield-halved",
      importance: "recommended",
    },
    {
      label: "Language",
      ok: Boolean(metaTags.language),
      detail: metaTags.language ? metaTags.language.toUpperCase() : "Not declared",
      icon: "globe",
      importance: "optional",
    },
    {
      label: "Charset",
      ok: Boolean(metaTags.charset),
      detail: metaTags.charset ? metaTags.charset.toUpperCase() : "Missing",
      icon: "font",
      importance: "critical",
    },
  ];

  const technicalStatusRows = [
    {
      label: "HTTPS / SSL",
      ok: Boolean(technical.hasSSL),
      detail: technical.hasSSL ? "Secure" : "Not detected",
      icon: "lock",
      importance: "critical",
    },
    {
      label: "Sitemap.xml",
      ok: Boolean(technical.hasSitemap),
      detail: technical.hasSitemap ? "Present" : "Missing",
      icon: "sitemap",
      importance: "critical",
    },
    {
      label: "Robots.txt",
      ok: Boolean(technical.hasRobotsTxt),
      detail: technical.hasRobotsTxt ? "Present" : "Missing",
      icon: "robot",
      importance: "recommended",
    },
    {
      label: "Mobile Responsive",
      ok: Boolean(technical.mobileResponsive),
      detail: technical.mobileResponsive ? "Yes" : "No viewport tag",
      icon: "mobile",
      importance: "critical",
    },
    {
      label: "Structured Data",
      ok: Boolean(technical.hasStructuredData),
      detail: technical.hasStructuredData ? "Found" : "None detected",
      icon: "code",
      importance: "recommended",
    },
    {
      label: "Compression",
      ok: Boolean(technical.compression),
      detail: technical.compression ? "Enabled" : "Not enabled",
      icon: "file-zipper",
      importance: "recommended",
    },
  ];

  const hasSocial = (social.openGraph && Object.keys(social.openGraph).length > 0) || (social.twitter && Object.keys(social.twitter).length > 0);

  const summaryCards = [
    {
      title: "Meta Coverage",
      value: `${metaCoverage}%`,
      caption: `${metaAvailable.length} of ${metaFields.length} essentials`,
      icon: "fa-tags",
      tone: metaCoverage >= 80 ? "positive" : metaCoverage >= 50 ? "warning" : "negative",
    },
    {
      title: "Page Load",
      value: `${(seoData.loadTime / 1000).toFixed(2)}s`,
      caption: `${(seoData.pageSize / 1024).toFixed(1)} KB page size`,
      icon: "fa-bolt",
      tone: seoData.loadTime <= 2500 ? "positive" : seoData.loadTime <= 5000 ? "warning" : "negative",
    },
    {
      title: "Alt Coverage",
      value: typeof altCoverage === "number" ? `${altCoverage}%` : "—",
      caption: images.total ? `${images.withAlt || 0} of ${images.total} images` : "No images detected",
      icon: "fa-image",
      tone: typeof altCoverage === "number" ? (altCoverage >= 80 ? "positive" : altCoverage >= 50 ? "warning" : "negative") : "neutral",
    },
    {
      title: "Lighthouse",
      value: typeof performance?.performance === "number" ? `${performance.performance}/100` : "—",
      caption: hasPerformanceScores ? "Performance score" : "No data yet",
      icon: "fa-gauge-simple-high",
      tone: typeof performance?.performance === "number" ? (performance.performance >= 80 ? "positive" : performance.performance >= 60 ? "warning" : "negative") : "neutral",
    },
  ];

  const lighthouseScores = hasPerformanceScores
    ? [
        { label: "Performance", value: performance.performance, icon: "fa-rocket" },
        { label: "Accessibility", value: performance.accessibility, icon: "fa-universal-access" },
        { label: "Best Practices", value: performance.bestPractices, icon: "fa-wand-magic-sparkles" },
        { label: "SEO", value: performance.seo, icon: "fa-chart-line" },
      ]
    : [];

  const topH2Headings = (headings.h2 || []).slice(0, 3);

  return {
    metaTags,
    technical,
    images,
    links,
    headings,
    social,
    performance,
    metaCoverage,
    altCoverage,
    h1Count,
    h2Count,
    h3Count,
    seoScore,
    clampScore,
    scoreDescriptor,
    hasPerformanceScores,
    strategyLabel,
    scoreRadius,
    scoreCircumference,
    gaugeDashArray,
    gaugeDashOffset,
    heroIntro,
    recommendations,
    criticalIssues,
    highPriorityIssues,
    mediumPriorityIssues,
    legacyRecommendations,
    highlightItems,
    metaStatusRows,
    technicalStatusRows,
    hasSocial,
    summaryCards,
    lighthouseScores,
    topH2Headings,
  };
}

async function getCommonData(userId) {
  logger.debug("Fetching common data for user: %s", userId);
  await ensureAdminAuth();
  const allWebsites = await pbAdmin.collection("websites").getFullList({
    filter: `user.id = "${userId}"`,
    sort: "created",
  });

  const websites = allWebsites.filter((w) => !w.isArchived);
  const archivedWebsites = allWebsites.filter((w) => w.isArchived);
  logger.debug("Found %d active and %d archived websites for user %s.", websites.length, archivedWebsites.length, userId);

  return { websites, archivedWebsites, allWebsites };
}

export async function showSeoAnalytics(req, res) {
  const { websiteId } = req.params;
  logger.info("Rendering SEO analytics page for website: %s, user: %s", websiteId, res.locals.user.id);

  try {
    const { websites, archivedWebsites, allWebsites } = await getCommonData(res.locals.user.id);

    const currentWebsite = allWebsites.find((w) => w.id === websiteId);
    if (!currentWebsite) {
      logger.warn("User %s attempted to access unauthorized or non-existent website %s", res.locals.user.id, websiteId);
      return res.status(404).render("404");
    }

    await ensureAdminAuth();
    let seoData = null;
    let viewData = null;

    try {
      const seoRecord = await pbAdmin.collection("seo_data").getFirstListItem(`website.id="${websiteId}"`);
      seoData = {
        metaTags: seoRecord.metaTags || {},
        socialMetaTags: seoRecord.socialMetaTags || {},
        headings: seoRecord.headings || {},
        images: seoRecord.images || {},
        links: seoRecord.links || {},
        technicalSeo: seoRecord.technicalSeo || {},
        performanceScores: seoRecord.performanceScores ?? null,
        lighthouseData: seoRecord.lighthouseData ?? null,
        analysisWarnings: seoRecord.analysisWarnings ?? [],
        recommendations: seoRecord.recommendations ?? [],
        loadTime: seoRecord.loadTime || 0,
        pageSize: seoRecord.pageSize || 0,
        lastAnalyzed: seoRecord.lastAnalyzed,
      };

      viewData = processSeoDataForView(seoData);
    } catch (e) {
      logger.debug("No existing SEO data found for website %s", websiteId);
    }

    res.render("seo-analytics", {
      websites,
      archivedWebsites,
      currentWebsite,
      seoData,
      viewData,
      currentPage: "seo",
    });
  } catch (error) {
    logger.error("Error loading SEO analytics for website %s: %o", websiteId, error);
    res.status(500).render("500");
  }
}

export async function runSeoAnalysis(req, res) {
  const { websiteId } = req.params;
  const { strategy } = req.body;
  logger.info("Running SEO analysis for website: %s, user: %s, strategy: %s", websiteId, res.locals.user.id, strategy || "auto");

  try {
    await ensureAdminAuth();
    const userId = res.locals.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const website = await pbAdmin.collection("websites").getFirstListItem(`id="${websiteId}" && user.id="${userId}"`);
    if (!website) {
      return res.status(404).json({ error: "Website not found" });
    }

    const seoData = await analyzeSeo(website.domain, strategy, userId);

    try {
      const existingRecord = await pbAdmin.collection("seo_data").getFirstListItem(`website.id="${websiteId}"`);
      await pbAdmin.collection("seo_data").update(existingRecord.id, {
        metaTags: seoData.metaTags,
        socialMetaTags: seoData.socialMetaTags,
        headings: seoData.headings,
        images: seoData.images,
        links: seoData.links,
        technicalSeo: seoData.technicalSeo,
        performanceScores: seoData.performanceScores,
        lighthouseData: seoData.lighthouseData,
        analysisWarnings: seoData.analysisWarnings,
        recommendations: seoData.recommendations,
        loadTime: seoData.loadTime,
        pageSize: seoData.pageSize,
        lastAnalyzed: seoData.lastAnalyzed,
      });
    } catch (e) {
      await pbAdmin.collection("seo_data").create({
        website: websiteId,
        metaTags: seoData.metaTags,
        socialMetaTags: seoData.socialMetaTags,
        headings: seoData.headings,
        images: seoData.images,
        links: seoData.links,
        technicalSeo: seoData.technicalSeo,
        performanceScores: seoData.performanceScores,
        lighthouseData: seoData.lighthouseData,
        analysisWarnings: seoData.analysisWarnings,
        recommendations: seoData.recommendations,
        loadTime: seoData.loadTime,
        pageSize: seoData.pageSize,
        lastAnalyzed: seoData.lastAnalyzed,
      });
    }

    const seoScore = calculateSeoScore(seoData);

    logger.info("SEO analysis completed successfully for website %s", websiteId);
    res.status(200).json({ success: true, seoData, seoScore, analysisWarnings: seoData.analysisWarnings });
  } catch (error) {
    logger.error("Failed to run SEO analysis for website %s: %o", websiteId, error);
    res.status(500).json({ error: "Failed to analyze SEO. Please check if the domain is accessible." });
  }
}

function escapeCSV(value) {
  if (value === null || value === undefined) return "";
  const stringValue = String(value);
  if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n")) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function generateCSV(seoData, website, viewData) {
  const lines = [];
  const timestamp = new Date().toISOString();

  lines.push("SEO Analytics Export");
  lines.push(`Website,${escapeCSV(website.name)}`);
  lines.push(`Domain,${escapeCSV(website.domain)}`);
  lines.push(`Export Date,${timestamp}`);
  lines.push(`Last Analyzed,${escapeCSV(seoData.lastAnalyzed)}`);
  lines.push(`SEO Score,${viewData.clampScore}/100`);
  lines.push("");

  lines.push("META TAGS");
  lines.push("Field,Value,Length");
  lines.push(`Title,${escapeCSV(seoData.metaTags.title)},${(seoData.metaTags.title || "").length}`);
  lines.push(`Description,${escapeCSV(seoData.metaTags.description)},${(seoData.metaTags.description || "").length}`);
  lines.push(`Keywords,${escapeCSV(seoData.metaTags.keywords)},${(seoData.metaTags.keywords || "").length}`);
  lines.push(`Canonical,${escapeCSV(seoData.metaTags.canonical)},`);
  lines.push(`Robots,${escapeCSV(seoData.metaTags.robots)},`);
  lines.push(`Viewport,${escapeCSV(seoData.metaTags.viewport)},`);
  lines.push(`Charset,${escapeCSV(seoData.metaTags.charset)},`);
  lines.push(`Language,${escapeCSV(seoData.metaTags.language)},`);
  lines.push("");

  lines.push("TECHNICAL SEO");
  lines.push("Aspect,Status");
  lines.push(`HTTPS/SSL,${seoData.technicalSeo.hasSSL ? "Yes" : "No"}`);
  lines.push(`Sitemap.xml,${seoData.technicalSeo.hasSitemap ? "Yes" : "No"}`);
  lines.push(`Robots.txt,${seoData.technicalSeo.hasRobotsTxt ? "Yes" : "No"}`);
  lines.push(`Mobile Responsive,${seoData.technicalSeo.mobileResponsive ? "Yes" : "No"}`);
  lines.push(`Structured Data,${seoData.technicalSeo.hasStructuredData ? "Yes" : "No"}`);
  lines.push(`Compression,${seoData.technicalSeo.compression ? "Yes" : "No"}`);
  lines.push(`Caching,${seoData.technicalSeo.caching ? "Yes" : "No"}`);
  lines.push("");

  if (seoData.performanceScores) {
    lines.push("LIGHTHOUSE PERFORMANCE");
    lines.push(`Strategy,${escapeCSV(seoData.performanceScores.strategy)}`);
    lines.push("Metric,Score");
    lines.push(`Performance,${seoData.performanceScores.performance}/100`);
    lines.push(`Accessibility,${seoData.performanceScores.accessibility}/100`);
    lines.push(`Best Practices,${seoData.performanceScores.bestPractices}/100`);
    lines.push(`SEO,${seoData.performanceScores.seo}/100`);
    lines.push("");

    if (seoData.performanceScores.metrics) {
      lines.push("CORE WEB VITALS");
      lines.push("Metric,Value");
      lines.push(`First Contentful Paint,${escapeCSV(seoData.performanceScores.metrics.fcp)}`);
      lines.push(`Largest Contentful Paint,${escapeCSV(seoData.performanceScores.metrics.lcp)}`);
      lines.push(`Total Blocking Time,${escapeCSV(seoData.performanceScores.metrics.tbt)}`);
      lines.push(`Cumulative Layout Shift,${escapeCSV(seoData.performanceScores.metrics.cls)}`);
      lines.push(`Speed Index,${escapeCSV(seoData.performanceScores.metrics.si)}`);
      lines.push("");
    }
  }

  lines.push("CONTENT STRUCTURE");
  lines.push("Heading Level,Count");
  lines.push(`H1,${viewData.h1Count}`);
  lines.push(`H2,${viewData.h2Count}`);
  lines.push(`H3,${viewData.h3Count}`);
  lines.push("");

  if ((seoData.headings.h1 || []).length > 0) {
    lines.push("H1 HEADINGS");
    for (const h1 of seoData.headings.h1) {
      lines.push(escapeCSV(h1));
    }
    lines.push("");
  }

  lines.push("IMAGES");
  lines.push("Metric,Value");
  lines.push(`Total Images,${seoData.images.total}`);
  lines.push(`With Alt Text,${seoData.images.withAlt}`);
  lines.push(`Without Alt Text,${seoData.images.withoutAlt}`);
  lines.push(`Alt Coverage,${viewData.altCoverage}%`);
  lines.push("");

  lines.push("LINKS");
  lines.push("Metric,Value");
  lines.push(`Total Links,${seoData.links.total}`);
  lines.push(`Internal Links,${seoData.links.internal}`);
  lines.push(`External Links,${seoData.links.external}`);
  lines.push(`Nofollow Links,${seoData.links.nofollow}`);
  lines.push("");

  if (seoData.recommendations && seoData.recommendations.length > 0) {
    lines.push("RECOMMENDATIONS");
    lines.push("Priority,Category,Issue,Description");
    for (const rec of seoData.recommendations) {
      lines.push(`${rec.priority},${rec.category},${escapeCSV(rec.issue)},${escapeCSV(rec.description)}`);
    }
    lines.push("");
  }

  if (seoData.analysisWarnings && seoData.analysisWarnings.length > 0) {
    lines.push("ANALYSIS WARNINGS");
    for (const warning of seoData.analysisWarnings) {
      lines.push(escapeCSV(warning));
    }
    lines.push("");
  }

  lines.push("PAGE PERFORMANCE");
  lines.push(`Load Time,${(seoData.loadTime / 1000).toFixed(2)}s`);
  lines.push(`Page Size,${(seoData.pageSize / 1024).toFixed(2)}KB`);

  return lines.join("\n");
}

export async function exportSeoAnalytics(req, res) {
  const { websiteId } = req.params;
  const format = req.query.format || "csv";
  logger.info("Exporting SEO analytics for website: %s, user: %s, format: %s", websiteId, res.locals.user.id, format);

  try {
    const { allWebsites } = await getCommonData(res.locals.user.id);
    const currentWebsite = allWebsites.find((w) => w.id === websiteId);

    if (!currentWebsite) {
      logger.warn("User %s attempted to export unauthorized or non-existent website %s", res.locals.user.id, websiteId);
      return res.status(404).json({ error: "Website not found" });
    }

    await ensureAdminAuth();
    let seoData = null;

    try {
      const seoRecord = await pbAdmin.collection("seo_data").getFirstListItem(`website.id="${websiteId}"`);
      seoData = {
        metaTags: seoRecord.metaTags || {},
        socialMetaTags: seoRecord.socialMetaTags || {},
        headings: seoRecord.headings || {},
        images: seoRecord.images || {},
        links: seoRecord.links || {},
        technicalSeo: seoRecord.technicalSeo || {},
        performanceScores: seoRecord.performanceScores ?? null,
        lighthouseData: seoRecord.lighthouseData ?? null,
        analysisWarnings: seoRecord.analysisWarnings ?? [],
        recommendations: seoRecord.recommendations ?? [],
        loadTime: seoRecord.loadTime || 0,
        pageSize: seoRecord.pageSize || 0,
        lastAnalyzed: seoRecord.lastAnalyzed,
      };
    } catch (e) {
      logger.debug("No existing SEO data found for website %s", websiteId);
      return res.status(404).json({ error: "No SEO data available for this website. Please run an analysis first." });
    }

    const viewData = processSeoDataForView(seoData);
    const timestamp = new Date().toISOString().split("T")[0];
    const safeDomain = currentWebsite.domain.replace(/[^a-z0-9]/gi, "_");

    if (format === "json") {
      const exportData = {
        website: {
          id: currentWebsite.id,
          name: currentWebsite.name,
          domain: currentWebsite.domain,
        },
        exportDate: new Date().toISOString(),
        seoScore: viewData.clampScore,
        scoreDescriptor: viewData.scoreDescriptor,
        lastAnalyzed: seoData.lastAnalyzed,
        metaTags: seoData.metaTags,
        socialMetaTags: seoData.socialMetaTags,
        technicalSeo: seoData.technicalSeo,
        performanceScores: seoData.performanceScores,
        headings: seoData.headings,
        images: seoData.images,
        links: seoData.links,
        recommendations: seoData.recommendations,
        analysisWarnings: seoData.analysisWarnings,
        loadTime: seoData.loadTime,
        pageSize: seoData.pageSize,
        summary: {
          metaCoverage: viewData.metaCoverage,
          altCoverage: viewData.altCoverage,
          h1Count: viewData.h1Count,
          h2Count: viewData.h2Count,
          h3Count: viewData.h3Count,
        },
      };

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="seo-analytics-${safeDomain}-${timestamp}.json"`);
      return res.status(200).send(JSON.stringify(exportData, null, 2));
    }

    if (format === "csv") {
      const csvContent = generateCSV(seoData, currentWebsite, viewData);

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="seo-analytics-${safeDomain}-${timestamp}.csv"`);
      return res.status(200).send(csvContent);
    }

    return res.status(400).json({ error: "Invalid format. Supported formats: csv, json" });
  } catch (error) {
    logger.error("Error exporting SEO analytics for website %s: %o", websiteId, error);
    res.status(500).json({ error: "Failed to export SEO analytics" });
  }
}
