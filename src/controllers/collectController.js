import { pbAdmin, ensureAdminAuth } from "../services/pocketbase.js";
import { broadcast } from "../services/sseManager.js";
import logger from "../utils/logger.js";
import geoip from "geoip-lite";
import { UAParser } from "ua-parser-js";
import { createHash } from "node:crypto";

const rateLimits = new Map();
const RATE_LIMIT_WINDOW = 60000;
const RATE_LIMIT_MAX_REQUESTS = 100;

const sessionCache = new Map();
const SESSION_TIMEOUT = 30 * 60 * 1000;
const SESSION_CACHE_CLEANUP_INTERVAL = 5 * 60 * 1000;

const visitorCache = new Map();
const VISITOR_CACHE_TTL = 15 * 60 * 1000;

const websiteCache = new Map();
const WEBSITE_CACHE_TTL = 5 * 60 * 1000;

const BOT_PATTERNS = /bot|crawl|spider|scrape|headless|phantom|selenium|puppeteer|playwright|slurp|mediapartners|facebookexternalhit|bingpreview|linkedinbot|twitterbot|whatsapp|telegram|discord/i;

function generateVisitorHash(siteId, ip, userAgent) {
  const data = `${siteId}:${ip || "unknown"}:${userAgent || "unknown"}`;
  return createHash("sha256").update(data).digest("hex").substring(0, 32);
}

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimits.get(ip);

  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW) {
    rateLimits.set(ip, { windowStart: now, count: 1 });
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  record.count++;
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimits.entries()) {
    if (now - record.windowStart > RATE_LIMIT_WINDOW * 2) {
      rateLimits.delete(ip);
    }
  }
}, RATE_LIMIT_WINDOW);

setInterval(() => {
  const now = Date.now();
  for (const [hash, data] of sessionCache.entries()) {
    if (now - data.lastActivity > SESSION_TIMEOUT) {
      sessionCache.delete(hash);
    }
  }
}, SESSION_CACHE_CLEANUP_INTERVAL);

setInterval(() => {
  const now = Date.now();
  for (const [hash, data] of visitorCache.entries()) {
    if (now - data.cachedAt > VISITOR_CACHE_TTL) {
      visitorCache.delete(hash);
    }
  }
}, SESSION_CACHE_CLEANUP_INTERVAL);

function isBot(userAgent, headers) {
  if (!userAgent) return true;
  if (BOT_PATTERNS.test(userAgent)) return true;
  const acceptLanguage = headers["accept-language"];
  if (!acceptLanguage) return true;
  return false;
}

function getClientIp(req) {
  return req.headers["cf-connecting-ip"] || req.headers["x-real-ip"] || req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || req.socket?.remoteAddress || "unknown";
}

function getGeoData(ip) {
  try {
    const geo = geoip.lookup(ip);
    if (geo) {
      return {
        country: geo.country || "Unknown",
        state: geo.region || "Unknown",
      };
    }
  } catch (e) {
    logger.debug("Geo lookup failed: %s", e.message);
  }
  return { country: "Unknown", state: "Unknown" };
}

function parseUserAgent(userAgent) {
  try {
    const parser = new UAParser(userAgent);
    const result = parser.getResult();
    return {
      browser: result.browser.name || "Unknown",
      os: result.os.name || "Unknown",
      device: result.device.type || "desktop",
    };
  } catch (e) {
    return { browser: "Unknown", os: "Unknown", device: "desktop" };
  }
}

async function getWebsiteByTrackingId(trackingId) {
  if (!trackingId || typeof trackingId !== "string" || trackingId.length > 50) {
    return null;
  }

  const cached = websiteCache.get(trackingId);
  if (cached && Date.now() - cached.cachedAt < WEBSITE_CACHE_TTL) {
    return cached.website;
  }

  try {
    await ensureAdminAuth();
    const website = await pbAdmin.collection("websites").getFirstListItem(`trackingId="${trackingId.replace(/"/g, "")}"`);
    websiteCache.set(trackingId, { website, cachedAt: Date.now() });
    return website;
  } catch (e) {
    if (e.status === 404) {
      logger.debug("Website not found for trackingId: %s", trackingId);
    } else {
      logger.error("Website lookup failed: %o", e);
    }
    return null;
  }
}

function sanitize(str, maxLen = 2048) {
  if (typeof str !== "string") return "";
  return str
    .replace(/[\p{Cc}]/gu, "")
    .trim()
    .slice(0, maxLen);
}

function extractPath(url) {
  if (!url) return "/";
  try {
    const parsed = new URL(url);
    return parsed.pathname || "/";
  } catch (e) {
    return url.split("?")[0] || "/";
  }
}

async function getOrCreateVisitor(visitorHash, websiteId) {
  const cached = visitorCache.get(visitorHash);
  if (cached && Date.now() - cached.cachedAt < VISITOR_CACHE_TTL) {
    return { visitorRecordId: cached.id, isNewVisitor: false };
  }

  try {
    await ensureAdminAuth();

    try {
      const visitor = await pbAdmin.collection("visitors").getFirstListItem(`visitorId="${visitorHash}" && website="${websiteId}"`);
      visitorCache.set(visitorHash, { id: visitor.id, cachedAt: Date.now() });
      return { visitorRecordId: visitor.id, isNewVisitor: false };
    } catch (e) {
      if (e.status === 404) {
        const visitor = await pbAdmin.collection("visitors").create({
          website: websiteId,
          visitorId: visitorHash,
        });
        visitorCache.set(visitorHash, { id: visitor.id, cachedAt: Date.now() });
        return { visitorRecordId: visitor.id, isNewVisitor: true };
      }
      throw e;
    }
  } catch (e) {
    logger.error("Failed to get/create visitor: %o", e);
    throw e;
  }
}

async function getOrCreateSession(visitorHash, visitorRecordId, websiteId, sessionData) {
  const now = Date.now();

  const cached = sessionCache.get(visitorHash);
  if (cached && now - cached.lastActivity < SESSION_TIMEOUT) {
    try {
      await pbAdmin.collection("sessions").update(cached.sessionId, {
        exitPath: sessionData.path,
      });
      cached.lastActivity = now;
      cached.eventCount++;
      return { sessionRecordId: cached.sessionId, isNewSession: false };
    } catch (e) {
      logger.debug("Cached session %s invalid (deleted?), creating new session: %s", cached.sessionId, e.message || e);
      sessionCache.delete(visitorHash);
    }
  }

  try {
    await ensureAdminAuth();
    const session = await pbAdmin.collection("sessions").create({
      website: websiteId,
      visitor: visitorRecordId,
      browser: sessionData.browser,
      os: sessionData.os,
      device: sessionData.device,
      screenWidth: sessionData.screenWidth ? String(sessionData.screenWidth) : "",
      screenHeight: sessionData.screenHeight ? String(sessionData.screenHeight) : "",
      language: sessionData.language || "",
      entryPath: sessionData.path,
      exitPath: sessionData.path,
      referrer: sessionData.referrer || "",
      country: sessionData.country || "Unknown",
      state: sessionData.state || "Unknown",
      ipAddress: sessionData.storeRawIp ? sessionData.ip : "",
      isNewVisitor: sessionData.isNewVisitor,
    });

    sessionCache.set(visitorHash, {
      sessionId: session.id,
      lastActivity: now,
      eventCount: 1,
    });

    logger.debug("Created new session %s for visitor hash %s", session.id, visitorHash);
    return { sessionRecordId: session.id, isNewSession: true };
  } catch (e) {
    logger.error("Failed to create session: %o", e);
    throw e;
  }
}

export async function handleCollect(req, res) {
  try {
    const ip = getClientIp(req);
    const userAgent = req.headers["user-agent"] || "";

    if (!checkRateLimit(ip)) {
      return res.status(429).json({ error: "Rate limit exceeded" });
    }

    if (isBot(userAgent, req.headers)) {
      return res.status(204).end();
    }

    const payload = req.body;
    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const website = await getWebsiteByTrackingId(payload.sid);
    if (!website) {
      return res.status(400).json({ error: "Invalid site ID" });
    }

    if (website.isArchived) {
      return res.status(204).end();
    }

    if (website.ipBlacklist && Array.isArray(website.ipBlacklist) && website.ipBlacklist.includes(ip)) {
      return res.status(204).end();
    }

    if (website.disableLocalhostTracking && (ip === "127.0.0.1" || ip === "::1" || ip === "localhost")) {
      return res.status(204).end();
    }

    const visitorHash = generateVisitorHash(payload.sid, ip, userAgent);

    const geo = getGeoData(ip);
    const ua = parseUserAgent(userAgent);

    let visitorRecordId;
    let isNewVisitor;
    try {
      const result = await getOrCreateVisitor(visitorHash, website.id);
      visitorRecordId = result.visitorRecordId;
      isNewVisitor = result.isNewVisitor;
    } catch (e) {
      logger.error("Visitor creation failed: %o", e);
      return res.status(500).json({ error: "Internal error" });
    }

    const path = extractPath(payload.url);
    const sessionData = {
      browser: ua.browser,
      os: ua.os,
      device: ua.device,
      screenWidth: payload.sw,
      screenHeight: payload.sh,
      language: sanitize(payload.lang, 10),
      path: sanitize(path, 2048),
      referrer: sanitize(payload.ref, 2048),
      country: geo.country,
      state: geo.state,
      ip: ip,
      storeRawIp: website.storeRawIp,
      isNewVisitor: isNewVisitor,
    };

    let sessionRecordId;
    let isNewSession;
    try {
      const result = await getOrCreateSession(visitorHash, visitorRecordId, website.id, sessionData);
      sessionRecordId = result.sessionRecordId;
      isNewSession = result.isNewSession;
    } catch (e) {
      logger.error("Session creation failed: %o", e);
      return res.status(500).json({ error: "Internal error" });
    }

    try {
      await ensureAdminAuth();

      if (payload.type === "batch" && Array.isArray(payload.events)) {
        for (const event of payload.events) {
          await processEvent(event, sessionRecordId, path, website.id);
        }
      } else if (payload.type === "errors" && Array.isArray(payload.errors)) {
        await processErrors(payload.errors, sessionRecordId, website.id, payload.url);
      } else if (payload.type === "exit") {
        logger.debug("Exit event processed for session %s", sessionRecordId);
      } else if (payload.type === "identify") {
        await processIdentify(payload, visitorRecordId);
      }

      if (isNewSession) {
        broadcast({
          type: "update",
          websiteId: website.id,
          action: "session_created",
        });
      }
    } catch (e) {
      logger.error("Event processing failed: %o", e);
    }

    res.status(204).end();
  } catch (error) {
    logger.error("Collect error: %o", error);
    res.status(500).json({ error: "Internal error" });
  }
}

async function processEvent(event, sessionRecordId, currentPath, websiteId) {
  try {
    const eventData = {
      session: sessionRecordId,
      path: sanitize(event.p || currentPath, 2048),
    };

    switch (event.t) {
      case "pv":
        eventData.type = "pageView";
        break;

      case "ev":
        eventData.type = "custom";
        eventData.eventName = sanitize(event.n, 255);
        if (event.d && typeof event.d === "object") {
          eventData.eventData = event.d;
        }
        break;

      case "out":
        eventData.type = "click";
        eventData.eventName = "outbound";
        eventData.eventData = { url: sanitize(event.u, 2048) };
        break;

      case "dl":
        eventData.type = "click";
        eventData.eventName = "download";
        eventData.eventData = {
          filename: sanitize(event.f, 255),
          url: sanitize(event.u, 2048),
        };
        break;

      default:
        logger.debug("Unknown event type: %s", event.t);
        return;
    }

    await pbAdmin.collection("events").create(eventData);

    if (eventData.type === "custom" && eventData.eventName) {
      broadcast({
        type: "update",
        websiteId: websiteId,
        action: "event_created",
        eventType: "custom",
      });
    }
  } catch (e) {
    logger.error("Failed to create event: %o", e);
  }
}

async function processErrors(errors, sessionRecordId, websiteId, url) {
  for (const error of errors.slice(0, 10)) {
    try {
      const errorMessage = sanitize(error.msg, 512);
      const stackTrace = sanitize(error.stack, 2048);
      const errorIdentifier = `${errorMessage}\n${(stackTrace || "").split("\n")[1] || ""}`;
      const errorHash = createHash("sha256").update(errorIdentifier).digest("hex");

      try {
        const existing = await pbAdmin.collection("js_errors").getFirstListItem(`errorHash="${errorHash}" && website="${websiteId}"`);
        await pbAdmin.collection("js_errors").update(existing.id, {
          "count+": error.count || 1,
          lastSeen: new Date().toISOString(),
        });
      } catch (e) {
        if (e.status === 404) {
          await pbAdmin.collection("js_errors").create({
            website: websiteId,
            session: sessionRecordId,
            errorHash: errorHash,
            errorMessage: errorMessage,
            stackTrace: stackTrace,
            url: sanitize(url, 2048),
            count: error.count || 1,
            lastSeen: new Date().toISOString(),
          });
        }
      }
    } catch (e) {
      logger.error("Failed to process error: %o", e);
    }
  }
}

async function processIdentify(payload, visitorRecordId) {
  try {
    const updateData = {};

    if (payload.uid) updateData.userId = sanitize(payload.uid, 255);
    if (payload.name) updateData.name = sanitize(payload.name, 255);
    if (payload.email) updateData.email = sanitize(payload.email, 255);
    if (payload.phone) updateData.phone = sanitize(payload.phone, 50);
    if (payload.meta && typeof payload.meta === "object") {
      updateData.metadata = payload.meta;
    }

    if (Object.keys(updateData).length > 0) {
      await pbAdmin.collection("visitors").update(visitorRecordId, updateData);
      logger.debug("Updated visitor identification: %s", visitorRecordId);
    }
  } catch (e) {
    logger.error("Failed to update visitor identification: %o", e);
  }
}

export function handleHealthCheck(req, res) {
  res.status(200).json({ status: "ok", timestamp: Date.now() });
}
