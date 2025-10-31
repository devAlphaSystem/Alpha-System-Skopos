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
  };

  for (const match of imgMatches) {
    images.total++;
    const img = match[0];
    const altMatch = img.match(/alt=["']([^"']*)["']/i);
    const srcMatch = img.match(/src=["']([^"']*)["']/i);

    if (altMatch?.[1]?.trim()) {
      images.withAlt++;
    } else {
      images.withoutAlt++;
      if (srcMatch) {
        images.missingAlt.push(srcMatch[1]);
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
  };

  const baseDomain = new URL(baseUrl).hostname;

  for (const match of linkMatches) {
    links.total++;
    const href = match[1];
    const fullMatch = match[0];

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
    } catch (e) {}
  }

  return links;
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

async function fetchPageSpeedInsights(url) {
  const apiKey = process.env.PAGESPEED_API_KEY || process.env.GOOGLE_PAGESPEED_API_KEY || null;
  const categories = ["PERFORMANCE", "ACCESSIBILITY", "BEST_PRACTICES", "SEO"];
  const strategiesEnv = process.env.PAGESPEED_STRATEGIES || "";
  const strategies = strategiesEnv
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (strategies.length === 0) {
    strategies.push("mobile", "desktop");
  }

  const warnings = [];

  const requestPageSpeed = (apiUrl, strategy) =>
    new Promise((resolve) => {
      const req = https.get(apiUrl, { timeout: 30000 }, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          if (res.statusCode !== 200) {
            const message = `Strategy ${strategy.toUpperCase()}: HTTP ${res.statusCode}`;
            warnings.push(message);
            logger.warn("PageSpeed Insights request failed (%s)", message);
            return resolve({ success: false });
          }

          try {
            const result = JSON.parse(data);

            if (result.error) {
              const message = `Strategy ${strategy.toUpperCase()}: ${result.error.message || "API error"}`;
              warnings.push(message);
              logger.warn("PageSpeed Insights API error (%s)", message);
              return resolve({ success: false });
            }

            const lighthouse = result.lighthouseResult;

            if (!lighthouse?.categories) {
              const message = `Strategy ${strategy.toUpperCase()}: Lighthouse data missing`;
              warnings.push(message);
              logger.warn("PageSpeed Insights response missing categories (%s)", message);
              return resolve({ success: false });
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

            return resolve({ success: true, data: dataPayload, raw: lighthouse });
          } catch (error) {
            const message = `Strategy ${strategy.toUpperCase()}: Failed to parse response`;
            warnings.push(message);
            logger.error("Error parsing PageSpeed Insights response: %o", error);
            return resolve({ success: false });
          }
        });
      });

      req.on("error", (error) => {
        const message = `Strategy ${strategy.toUpperCase()}: ${error.message}`;
        warnings.push(message);
        logger.error("Error fetching PageSpeed Insights (%s): %o", strategy, error);
        resolve({ success: false });
      });

      req.on("timeout", () => {
        const message = `Strategy ${strategy.toUpperCase()}: request timeout`;
        warnings.push(message);
        logger.warn("PageSpeed Insights request timeout (%s)", strategy);
        req.destroy();
        resolve({ success: false });
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

    const attempt = await requestPageSpeed(apiUrl, strategy);
    if (attempt.success) {
      attempt.warnings = warnings;
      return attempt;
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

export async function analyzeSeo(domain) {
  logger.info("Starting SEO analysis for: %s", domain);
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

    const pageSpeedResult = await fetchPageSpeedInsights(url);
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

    logger.info("SEO analysis completed for %s in %dms", domain, loadTime);

    return {
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
