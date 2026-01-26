import express from "express";
import { handleCollect, handleHealthCheck } from "../controllers/collectController.js";
import { pbAdmin, ensureAdminAuth } from "../services/pocketbase.js";
import logger from "../utils/logger.js";

const router = express.Router();

let allowedDomainsCache = new Set();
let lastCacheUpdate = 0;
let refreshInProgress = null;
const CACHE_TTL = 5 * 60 * 1000;

async function refreshAllowedDomains() {
  try {
    await ensureAdminAuth();
    const websites = await pbAdmin.collection("websites").getFullList({
      filter: "isArchived = false",
      fields: "domain",
    });

    const domains = new Set();
    for (const website of websites) {
      if (website.domain) {
        try {
          const url = website.domain.startsWith("http") ? website.domain : `https://${website.domain}`;
          const hostname = new URL(url).hostname.toLowerCase();
          domains.add(hostname);
          if (!hostname.startsWith("www.")) {
            domains.add(`www.${hostname}`);
          } else {
            domains.add(hostname.replace(/^www\./, ""));
          }
        } catch {
          domains.add(website.domain.toLowerCase());
        }
      }
    }

    allowedDomainsCache = domains;
    lastCacheUpdate = Date.now();
    logger.debug("Refreshed allowed domains cache: %d domains", domains.size);
  } catch (error) {
    logger.error("Failed to refresh allowed domains cache: %o", error);
    if (lastCacheUpdate === 0) {
      lastCacheUpdate = Date.now() - CACHE_TTL + 30000;
    }
  }
}

function isOriginAllowed(origin) {
  if (!origin) return false;

  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return allowedDomainsCache.has(hostname);
  } catch {
    return false;
  }
}

async function ensureCacheFresh() {
  if (Date.now() - lastCacheUpdate > CACHE_TTL) {
    if (!refreshInProgress) {
      refreshInProgress = refreshAllowedDomains().finally(() => {
        refreshInProgress = null;
      });
    }
    await refreshInProgress;
  }
}

function setCorsHeaders(res, origin) {
  res.header("Access-Control-Allow-Origin", origin);
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Max-Age", "86400");
  res.header("Vary", "Origin");
}

const cacheReady = refreshAllowedDomains();

const collectCors = async (req, res, next) => {
  const origin = req.headers.origin;

  if (!origin) {
    return next();
  }

  try {
    await cacheReady;
    await ensureCacheFresh();
  } catch (error) {
    logger.error("Cache refresh error in CORS middleware: %o", error);
  }

  if (!isOriginAllowed(origin)) {
    logger.warn("CORS denied for origin: %s (allowed domains: %s)", origin, Array.from(allowedDomainsCache).join(", "));
    return res.status(403).json({ error: "Origin not allowed" });
  }

  setCorsHeaders(res, origin);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  next();
};

router.options("/collect", collectCors);
router.post("/collect", collectCors, handleCollect);

router.get("/collect/health", handleHealthCheck);

export default router;
