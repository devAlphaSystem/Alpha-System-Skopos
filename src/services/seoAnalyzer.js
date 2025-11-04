import https from "node:https";
import http from "node:http";
import { URL } from "node:url";
import logger from "./logger.js";

async function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === "https:" ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
      timeout: 10000,
    };

    const req = client.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ html: data, statusCode: res.statusCode, headers: res.headers });
        } else if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, url);
          fetchHtml(redirectUrl.toString()).then(resolve).catch(reject);
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });

    req.end();
  });
}

function extractMetaTags(html) {
  const metaTags = {};

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  metaTags.title = titleMatch ? titleMatch[1].trim() : null;

  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i);
  metaTags.description = descMatch ? descMatch[1].trim() : null;

  const keywordsMatch = html.match(/<meta[^>]*name=["']keywords["'][^>]*content=["']([^"']*)["']/i);
  metaTags.keywords = keywordsMatch ? keywordsMatch[1].trim() : null;

  const canonicalMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["']/i);
  metaTags.canonical = canonicalMatch ? canonicalMatch[1].trim() : null;

  const robotsMatch = html.match(/<meta[^>]*name=["']robots["'][^>]*content=["']([^"']*)["']/i);
  metaTags.robots = robotsMatch ? robotsMatch[1].trim() : null;

  const viewportMatch = html.match(/<meta[^>]*name=["']viewport["'][^>]*content=["']([^"']*)["']/i);
  metaTags.viewport = viewportMatch ? viewportMatch[1].trim() : null;

  const charsetMatch = html.match(/<meta[^>]*charset=["']([^"']*)["']/i) || html.match(/<meta[^>]*content=["'][^"']*charset=([^"';]*)["']/i);
  metaTags.charset = charsetMatch ? charsetMatch[1].trim() : null;

  const langMatch = html.match(/<html[^>]*lang=["']([^"']*)["']/i);
  metaTags.language = langMatch ? langMatch[1].trim() : null;

  return metaTags;
}

function extractSocialMetaTags(html) {
  const socialTags = {
    openGraph: {},
    twitter: {},
  };

  const ogMatches = html.matchAll(/<meta[^>]*property=["']og:([^"']*)["'][^>]*content=["']([^"']*)["']/gi);
  for (const match of ogMatches) {
    socialTags.openGraph[match[1]] = match[2];
  }

  const twitterMatches = html.matchAll(/<meta[^>]*name=["']twitter:([^"']*)["'][^>]*content=["']([^"']*)["']/gi);
  for (const match of twitterMatches) {
    socialTags.twitter[match[1]] = match[2];
  }

  return socialTags;
}

function extractHeadings(html) {
  const headings = { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] };

  for (let i = 1; i <= 6; i++) {
    const regex = new RegExp(`<h${i}[^>]*>([^<]*)<\/h${i}>`, "gi");
    const matches = html.matchAll(regex);
    for (const match of matches) {
      const text = match[1].trim().replace(/<[^>]*>/g, "");
      if (text) {
        headings[`h${i}`].push(text);
      }
    }
  }

  return headings;
}

function analyzeImages(html) {
  const imgMatches = html.matchAll(/<img[^>]*>/gi);
  const images = {
    total: 0,
    withAlt: 0,
    withoutAlt: 0,
    missingAlt: [],
    emptyAlt: [],
    poorQualityAlt: [],
    withoutTitle: 0,
    oversized: [],
  };

  for (const match of imgMatches) {
    images.total++;
    const img = match[0];
    const altMatch = img.match(/alt=["']([^"']*)["']/i);
    const srcMatch = img.match(/src=["']([^"']*)["']/i);
    const titleMatch = img.match(/title=["']([^"']*)["']/i);
    const widthMatch = img.match(/width=["']?(\d+)["']?/i);
    const heightMatch = img.match(/height=["']?(\d+)["']?/i);

    const src = srcMatch ? srcMatch[1] : null;
    const altText = altMatch ? altMatch[1].trim() : "";

    if (!titleMatch) {
      images.withoutTitle++;
    }

    if (widthMatch && heightMatch) {
      const width = Number.parseInt(widthMatch[1]);
      const height = Number.parseInt(heightMatch[1]);
      if (width > 2000 || height > 2000) {
        if (src) images.oversized.push({ src, width, height });
      }
    }

    if (altText) {
      images.withAlt++;

      if (altText.length < 5 || /^(image|img|photo|picture)\d*$/i.test(altText)) {
        images.poorQualityAlt.push({ src, alt: altText });
      }
    } else if (altMatch) {
      images.emptyAlt.push(src);
      images.withoutAlt++;
    } else {
      images.withoutAlt++;
      if (src) {
        images.missingAlt.push(src);
      }
    }
  }

  return images;
}

function analyzeLinks(html, baseUrl) {
  const linkMatches = html.matchAll(/<a[^>]*href=["']([^"']*)["'][^>]*>/gi);
  const links = {
    total: 0,
    internal: 0,
    external: 0,
    nofollow: 0,
    broken: [],
    emptyAnchors: [],
    suspiciousLinks: [],
  };

  const baseDomain = new URL(baseUrl).hostname;

  for (const match of linkMatches) {
    links.total++;
    const href = match[1];
    const fullMatch = match[0];
    const anchorText =
      html
        .substring(match.index, match.index + 200)
        .match(/<a[^>]*>([^<]*)<\/a>/i)?.[1]
        ?.trim() || "";

    if (!anchorText || anchorText.length === 0) {
      links.emptyAnchors.push(href);
    }

    if (href === "#" || href === "" || href === "javascript:void(0)") {
      links.suspiciousLinks.push({ href, reason: "Empty or placeholder link" });
      continue;
    }

    try {
      const linkUrl = new URL(href, baseUrl);
      if (linkUrl.hostname === baseDomain) {
        links.internal++;
      } else {
        links.external++;
      }

      if (fullMatch.includes('rel="nofollow"') || fullMatch.includes("rel='nofollow'")) {
        links.nofollow++;
      }
    } catch (e) {
      links.suspiciousLinks.push({ href, reason: "Invalid URL format" });
    }
  }

  return links;
}

async function checkBrokenLinks(html, baseUrl, maxLinksToCheck = 20) {
  const linkMatches = html.matchAll(/<a[^>]*href=["']([^"']*)["'][^>]*>/gi);
  const brokenLinks = [];
  const checkedLinks = new Set();
  let checkCount = 0;

  const baseDomain = new URL(baseUrl).hostname;

  for (const match of linkMatches) {
    if (checkCount >= maxLinksToCheck) break;

    const href = match[1];

    if (href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      continue;
    }

    try {
      const linkUrl = new URL(href, baseUrl);

      if (linkUrl.hostname !== baseDomain) {
        continue;
      }

      const fullUrl = linkUrl.toString();
      if (checkedLinks.has(fullUrl)) continue;
      checkedLinks.add(fullUrl);
      checkCount++;

      try {
        const { statusCode } = await fetchHtml(fullUrl);
        if (statusCode >= 400) {
          brokenLinks.push({ url: fullUrl, statusCode });
        }
      } catch (error) {
        brokenLinks.push({ url: fullUrl, error: error.message });
      }
    } catch (e) {}
  }

  return brokenLinks;
}

function analyzeTechnicalSeo(html, headers, url) {
  const technical = {
    hasRobotsTxt: false,
    hasSitemap: false,
    hasSSL: url.startsWith("https://"),
    hasStructuredData: false,
    mobileResponsive: false,
    pageSpeed: null,
    pageSpeedStrategy: null,
    compression: false,
    caching: false,
  };

  technical.hasStructuredData = html.includes('type="application/ld+json"') || html.includes("itemscope") || html.includes("vocab=");
  technical.mobileResponsive = html.includes('name="viewport"');
  technical.compression = headers["content-encoding"] && (headers["content-encoding"].includes("gzip") || headers["content-encoding"].includes("br"));
  technical.caching = !!(headers["cache-control"] || headers.expires);

  return technical;
}

function generateRecommendations(seoData) {
  const recommendations = [];
  const { metaTags, technicalSeo, images, links, headings, performanceScores } = seoData;

  const h1Count = (headings?.h1 || []).length;

  if (!metaTags?.title) {
    recommendations.push({
      priority: "critical",
      category: "meta",
      issue: "Missing title tag",
      description: "Add a descriptive <title> tag (50-60 characters) that includes your primary keyword.",
      impact: "high",
    });
  } else if (metaTags.title.length < 30) {
    recommendations.push({
      priority: "high",
      category: "meta",
      issue: "Title tag too short",
      description: `Your title is only ${metaTags.title.length} characters. Aim for 50-60 characters for optimal display in search results.`,
      impact: "medium",
    });
  } else if (metaTags.title.length > 60) {
    recommendations.push({
      priority: "medium",
      category: "meta",
      issue: "Title tag too long",
      description: `Your title is ${metaTags.title.length} characters. Consider shortening it to 50-60 characters to avoid truncation.`,
      impact: "low",
    });
  }

  if (!metaTags?.description) {
    recommendations.push({
      priority: "critical",
      category: "meta",
      issue: "Missing meta description",
      description: "Write a compelling meta description (150-160 characters) that summarizes your page content.",
      impact: "high",
    });
  } else if (metaTags.description.length < 120) {
    recommendations.push({
      priority: "high",
      category: "meta",
      issue: "Meta description too short",
      description: `Your description is only ${metaTags.description.length} characters. Aim for 150-160 characters for better visibility.`,
      impact: "medium",
    });
  } else if (metaTags.description.length > 160) {
    recommendations.push({
      priority: "medium",
      category: "meta",
      issue: "Meta description too long",
      description: `Your description is ${metaTags.description.length} characters. Consider shortening it to avoid truncation in search results.`,
      impact: "low",
    });
  }

  if (!metaTags?.canonical) {
    recommendations.push({
      priority: "high",
      category: "meta",
      issue: "Missing canonical URL",
      description: "Define a canonical URL to prevent duplicate content issues and consolidate page authority.",
      impact: "medium",
    });
  }

  if (!technicalSeo?.hasSSL) {
    recommendations.push({
      priority: "critical",
      category: "security",
      issue: "No HTTPS/SSL",
      description: "Serve your site over HTTPS to protect user data and avoid browser security warnings. Google prioritizes HTTPS sites.",
      impact: "high",
    });
  }

  if (!technicalSeo?.hasSitemap) {
    recommendations.push({
      priority: "critical",
      category: "technical",
      issue: "Missing sitemap",
      description: "Provide a sitemap.xml file to help search engines discover and index all your pages efficiently.",
      impact: "high",
    });
  }

  if (!technicalSeo?.hasRobotsTxt) {
    recommendations.push({
      priority: "high",
      category: "technical",
      issue: "Missing robots.txt",
      description: "Add a robots.txt file to control crawler access and guide search engines to your sitemap.",
      impact: "medium",
    });
  }

  if (!technicalSeo?.mobileResponsive) {
    recommendations.push({
      priority: "critical",
      category: "mobile",
      issue: "Not mobile responsive",
      description: "Add a viewport meta tag and ensure your site is mobile-friendly. Mobile-first indexing is now the standard.",
      impact: "high",
    });
  }

  if (h1Count === 0) {
    recommendations.push({
      priority: "critical",
      category: "content",
      issue: "Missing H1 heading",
      description: "Add exactly one H1 heading to clearly define the main topic of your page.",
      impact: "high",
    });
  } else if (h1Count > 1) {
    recommendations.push({
      priority: "high",
      category: "content",
      issue: "Multiple H1 headings",
      description: `You have ${h1Count} H1 headings. Use only one H1 per page for better SEO structure.`,
      impact: "medium",
    });
  }

  if ((headings?.h2 || []).length === 0) {
    recommendations.push({
      priority: "medium",
      category: "content",
      issue: "No H2 headings",
      description: "Add H2 headings to structure your content and improve readability. Use them for main sections.",
      impact: "medium",
    });
  }

  if (images?.total > 0) {
    const altCoverage = (images.withAlt / images.total) * 100;
    if (altCoverage < 100) {
      recommendations.push({
        priority: altCoverage < 50 ? "high" : "medium",
        category: "images",
        issue: `${images.withoutAlt} images missing alt text`,
        description: `Add descriptive alt text to ${images.withoutAlt} images for accessibility and SEO. Alt coverage: ${altCoverage.toFixed(0)}%`,
        impact: altCoverage < 50 ? "high" : "medium",
      });
    }

    if (images.poorQualityAlt?.length > 0) {
      recommendations.push({
        priority: "medium",
        category: "images",
        issue: "Poor quality alt text",
        description: `${images.poorQualityAlt.length} images have generic alt text (e.g., "image1", "photo"). Use descriptive, meaningful alt text.`,
        impact: "medium",
      });
    }

    if (images.oversized?.length > 0) {
      recommendations.push({
        priority: "medium",
        category: "performance",
        issue: "Oversized images",
        description: `${images.oversized.length} images are larger than 2000px. Optimize image sizes for faster loading.`,
        impact: "medium",
      });
    }
  }

  if (links?.emptyAnchors?.length > 0) {
    recommendations.push({
      priority: "medium",
      category: "links",
      issue: "Links with empty anchor text",
      description: `${links.emptyAnchors.length} links have no anchor text. Add descriptive text to improve accessibility and SEO.`,
      impact: "medium",
    });
  }

  if (links?.suspiciousLinks?.length > 0) {
    recommendations.push({
      priority: "low",
      category: "links",
      issue: "Suspicious or placeholder links",
      description: `${links.suspiciousLinks.length} links appear to be placeholders (e.g., "#", "javascript:void(0)"). Consider removing or replacing them.`,
      impact: "low",
    });
  }

  if (links?.broken?.length > 0) {
    recommendations.push({
      priority: "high",
      category: "links",
      issue: "Broken internal links detected",
      description: `${links.broken.length} internal links are broken or returning errors. Fix these to improve user experience and SEO.`,
      impact: "high",
    });
  }

  if (!technicalSeo?.hasStructuredData) {
    recommendations.push({
      priority: "medium",
      category: "technical",
      issue: "No structured data",
      description: "Implement structured data (JSON-LD) to enable rich snippets and improve search result appearance.",
      impact: "medium",
    });
  }

  if (!technicalSeo?.compression) {
    recommendations.push({
      priority: "high",
      category: "performance",
      issue: "No compression enabled",
      description: "Enable gzip or brotli compression on your server to reduce file sizes and improve page load speed.",
      impact: "medium",
    });
  }

  if (!technicalSeo?.caching) {
    recommendations.push({
      priority: "medium",
      category: "performance",
      issue: "No cache headers",
      description: "Configure cache-control headers to improve repeat visit performance and reduce server load.",
      impact: "low",
    });
  }

  if (performanceScores?.performance !== null && performanceScores?.performance !== undefined) {
    if (performanceScores.performance < 50) {
      recommendations.push({
        priority: "critical",
        category: "performance",
        issue: "Poor performance score",
        description: `Your Lighthouse performance score is ${performanceScores.performance}/100. Focus on optimizing images, reducing JavaScript, and improving server response times.`,
        impact: "high",
      });
    } else if (performanceScores.performance < 80) {
      recommendations.push({
        priority: "medium",
        category: "performance",
        issue: "Performance could be improved",
        description: `Your Lighthouse performance score is ${performanceScores.performance}/100. Consider optimizing assets and reducing render-blocking resources.`,
        impact: "medium",
      });
    }
  }

  recommendations.sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  return recommendations;
}

async function fetchPageSpeedInsights(url, preferredStrategy = null) {
  const apiKey = process.env.PAGESPEED_API_KEY || null;
  const categories = ["PERFORMANCE", "ACCESSIBILITY", "BEST_PRACTICES", "SEO"];

  let strategies = [];

  if (preferredStrategy && (preferredStrategy.toLowerCase() === "mobile" || preferredStrategy.toLowerCase() === "desktop")) {
    strategies.push(preferredStrategy.toLowerCase());
  } else {
    const strategiesEnv = process.env.PAGESPEED_STRATEGIES || "";
    strategies = strategiesEnv
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    if (strategies.length === 0) {
      strategies.push("mobile", "desktop");
    }
  }

  const warnings = [];

  const requestPageSpeed = (apiUrl, strategy, retryCount = 0, maxRetries = 2) =>
    new Promise((resolve) => {
      const req = https.get(apiUrl, { timeout: 45000 }, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          if (res.statusCode !== 200) {
            const message = `Strategy ${strategy.toUpperCase()}: HTTP ${res.statusCode}`;
            warnings.push(message);
            logger.warn("PageSpeed Insights request failed (%s)", message);
            return resolve({ success: false, retryable: res.statusCode >= 500 });
          }

          try {
            const result = JSON.parse(data);

            if (result.error) {
              const message = `Strategy ${strategy.toUpperCase()}: ${result.error.message || "API error"}`;
              warnings.push(message);
              logger.warn("PageSpeed Insights API error (%s)", message);
              return resolve({ success: false, retryable: false });
            }

            const lighthouse = result.lighthouseResult;

            if (!lighthouse?.categories) {
              const message = `Strategy ${strategy.toUpperCase()}: Lighthouse data missing`;
              warnings.push(message);
              logger.warn("PageSpeed Insights response missing categories (%s)", message);
              return resolve({ success: false, retryable: false });
            }

            const toPercent = (value) => (typeof value === "number" && !Number.isNaN(value) ? Math.round(value * 100) : null);

            const dataPayload = {
              performance: toPercent(lighthouse.categories.performance?.score),
              accessibility: toPercent(lighthouse.categories.accessibility?.score),
              bestPractices: toPercent(lighthouse.categories["best-practices"]?.score),
              seo: toPercent(lighthouse.categories.seo?.score),
              metrics: {
                fcp: lighthouse.audits?.["first-contentful-paint"]?.displayValue || "N/A",
                lcp: lighthouse.audits?.["largest-contentful-paint"]?.displayValue || "N/A",
                tbt: lighthouse.audits?.["total-blocking-time"]?.displayValue || "N/A",
                cls: lighthouse.audits?.["cumulative-layout-shift"]?.displayValue || "N/A",
                si: lighthouse.audits?.["speed-index"]?.displayValue || "N/A",
              },
              strategy,
              fetchTime: lighthouse.fetchTime || result.analysisUTCTimestamp || null,
            };

            logger.info("PageSpeed Insights successful for %s strategy", strategy);
            return resolve({ success: true, data: dataPayload, raw: lighthouse });
          } catch (error) {
            const message = `Strategy ${strategy.toUpperCase()}: Failed to parse response`;
            warnings.push(message);
            logger.error("Error parsing PageSpeed Insights response: %o", error);
            return resolve({ success: false, retryable: false });
          }
        });
      });

      req.on("error", (error) => {
        const isRetryable = error.code === "ECONNRESET" || error.code === "ETIMEDOUT" || error.code === "ENOTFOUND";
        const message = `Strategy ${strategy.toUpperCase()}: ${error.message} (code: ${error.code || "unknown"})`;

        if (retryCount < maxRetries && isRetryable) {
          logger.warn("PageSpeed Insights connection error (%s), attempt %d/%d - will retry", strategy, retryCount + 1, maxRetries + 1);
        } else {
          warnings.push(message);
          logger.error("Error fetching PageSpeed Insights (%s): %o", strategy, error);
        }

        resolve({ success: false, retryable: isRetryable });
      });

      req.on("timeout", () => {
        const message = `Strategy ${strategy.toUpperCase()}: request timeout after 45s`;

        if (retryCount < maxRetries) {
          logger.warn("PageSpeed Insights timeout (%s), attempt %d/%d - will retry", strategy, retryCount + 1, maxRetries + 1);
        } else {
          warnings.push(message);
          logger.warn("PageSpeed Insights request timeout (%s) - max retries reached", strategy);
        }

        req.destroy();
        resolve({ success: false, retryable: true });
      });
    });

  for (const strategy of strategies) {
    const params = new URLSearchParams();
    params.set("url", url);
    params.set("strategy", strategy);
    for (const category of categories) {
      params.append("category", category);
    }
    if (apiKey) {
      params.set("key", apiKey);
    }

    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`;
    logger.info("Requesting PageSpeed Insights (%s) for %s", strategy, url);

    const maxRetries = 2;
    for (let retryCount = 0; retryCount <= maxRetries; retryCount++) {
      if (retryCount > 0) {
        const backoffDelay = Math.min(1000 * 2 ** (retryCount - 1), 5000);
        logger.info("Retrying PageSpeed request after %dms (attempt %d/%d)", backoffDelay, retryCount + 1, maxRetries + 1);
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
      }

      const attempt = await requestPageSpeed(apiUrl, strategy, retryCount, maxRetries);

      if (attempt.success) {
        attempt.warnings = warnings;
        return attempt;
      }

      if (!attempt.retryable || retryCount === maxRetries) {
        break;
      }
    }
  }

  if (warnings.length === 0) {
    warnings.push("PageSpeed Insights request failed for all strategies");
  }
  logger.warn("PageSpeed Insights failed for %s: %s", url, warnings.join(" | "));
  return { success: false, warnings };
}

async function checkRobotsTxt(domain) {
  try {
    const robotsUrl = `${domain}/robots.txt`;
    const { statusCode } = await fetchHtml(robotsUrl);
    return statusCode === 200;
  } catch (e) {
    return false;
  }
}

async function checkSitemap(domain) {
  try {
    const sitemapUrl = `${domain}/sitemap.xml`;
    const { statusCode } = await fetchHtml(sitemapUrl);
    return statusCode === 200;
  } catch (e) {
    return false;
  }
}

export async function analyzeSeo(domain, strategy = null) {
  logger.info("Starting SEO analysis for: %s with strategy: %s", domain, strategy || "auto");
  const startTime = Date.now();

  try {
    let url = domain;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = `https://${url}`;
    }

    const { html, headers } = await fetchHtml(url);

    const metaTags = extractMetaTags(html);
    const socialMetaTags = extractSocialMetaTags(html);
    const headings = extractHeadings(html);
    const images = analyzeImages(html);
    const links = analyzeLinks(html, url);
    const technicalSeo = analyzeTechnicalSeo(html, headers, url);

    technicalSeo.hasRobotsTxt = await checkRobotsTxt(url);
    technicalSeo.hasSitemap = await checkSitemap(url);

    logger.info("Checking for broken links on %s", domain);
    const brokenLinks = await checkBrokenLinks(html, url, 20);
    links.broken = brokenLinks;

    const pageSpeedResult = await fetchPageSpeedInsights(url, strategy);
    const analysisWarnings = [...(pageSpeedResult.warnings || [])];
    const performanceScores = pageSpeedResult.success ? pageSpeedResult.data : null;
    const lighthouseData = pageSpeedResult.success ? pageSpeedResult.raw : null;

    if (performanceScores) {
      technicalSeo.pageSpeed = performanceScores.performance;
      technicalSeo.pageSpeedStrategy = performanceScores.strategy ? performanceScores.strategy.toUpperCase() : null;
    } else if (analysisWarnings.length === 0) {
      analysisWarnings.push("Unable to retrieve Lighthouse metrics. Ensure the domain is publicly accessible and consider configuring a Google PageSpeed API key.");
    }

    const loadTime = Date.now() - startTime;
    const pageSize = Buffer.byteLength(html, "utf8");

    const seoData = {
      metaTags,
      socialMetaTags,
      headings,
      images,
      links,
      technicalSeo,
      performanceScores,
      lighthouseData,
      analysisWarnings,
      loadTime,
      pageSize,
      lastAnalyzed: new Date().toISOString(),
    };

    const recommendations = generateRecommendations(seoData);
    seoData.recommendations = recommendations;

    logger.info("SEO analysis completed for %s in %dms", domain, loadTime);

    return seoData;
  } catch (error) {
    logger.error("Error analyzing SEO for %s: %o", domain, error);
    throw error;
  }
}

export function calculateSeoScore(seoData) {
  let score = 0;
  let maxScore = 0;

  maxScore += 30;
  if (seoData.metaTags?.title) score += 10;
  if (seoData.metaTags?.description) score += 10;
  if (seoData.metaTags?.viewport) score += 5;
  if (seoData.metaTags?.canonical) score += 5;

  maxScore += 25;
  if (seoData.technicalSeo?.hasSSL) score += 10;
  if (seoData.technicalSeo?.hasRobotsTxt) score += 5;
  if (seoData.technicalSeo?.hasSitemap) score += 5;
  if (seoData.technicalSeo?.mobileResponsive) score += 5;

  maxScore += 15;
  if (seoData.images?.total > 0) {
    const altRatio = seoData.images.withAlt / seoData.images.total;
    score += Math.round(altRatio * 15);
  } else {
    score += 15;
  }

  maxScore += 15;
  if (seoData.headings?.h1?.length === 1) score += 10;
  if (seoData.headings?.h2?.length > 0) score += 5;

  maxScore += 15;
  if (seoData.performanceScores?.performance) {
    score += Math.round((seoData.performanceScores.performance / 100) * 15);
  }

  return Math.round((score / maxScore) * 100);
}
