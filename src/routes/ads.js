import express from "express";
import { showAdvertisements, createAd, updateAd, deleteAd, getAdMetrics, generateFromSeo, previewBanner, getAdBanner, getEmbedCode, toggleAdStatus } from "../controllers/adsController.js";
import { recordAdClick } from "../services/adsService.js";
import { detectMobile } from "../utils/deviceDetection.js";
import geoip from "geoip-lite";
import { UAParser } from "ua-parser-js";
import logger from "../utils/logger.js";

const router = express.Router();

function requireAuth(req, res, next) {
  if (res.locals.user) {
    return next();
  }
  res.redirect("/login");
}

function blockMobile(req, res, next) {
  if (detectMobile(req)) {
    return res.status(403).render("403", { user: res.locals.user });
  }
  next();
}

function getClientIp(req) {
  return req.headers["cf-connecting-ip"] || req.headers["x-real-ip"] || req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || req.socket?.remoteAddress || "unknown";
}

function getGeoData(ip) {
  try {
    const geo = geoip.lookup(ip);
    if (geo) {
      return { country: geo.country || "Unknown" };
    }
  } catch (e) {
    logger.debug("Geo lookup failed: %s", e.message);
  }
  return { country: "Unknown" };
}

function parseUserAgent(userAgent) {
  try {
    const parser = new UAParser(userAgent);
    const result = parser.getResult();
    return {
      browser: result.browser.name || "Unknown",
      device: result.device.type || "desktop",
    };
  } catch (e) {
    return { browser: "Unknown", device: "desktop" };
  }
}

router.get("/dashboard/ads/:websiteId", requireAuth, blockMobile, showAdvertisements);

router.post("/dashboard/ads/:websiteId/create", requireAuth, createAd);
router.put("/dashboard/ads/:websiteId/:adId", requireAuth, updateAd);
router.delete("/dashboard/ads/:websiteId/:adId", requireAuth, deleteAd);
router.get("/dashboard/ads/:websiteId/:adId/metrics", requireAuth, getAdMetrics);
router.post("/dashboard/ads/:websiteId/generate", requireAuth, generateFromSeo);
router.post("/dashboard/ads/preview", requireAuth, previewBanner);
router.get("/dashboard/ads/:websiteId/:adId/embed", requireAuth, getEmbedCode);
router.post("/dashboard/ads/:websiteId/:adId/toggle", requireAuth, toggleAdStatus);

router.get("/ads/banner/:adId", getAdBanner);

router.get("/ads/click/:adId", async (req, res) => {
  const { adId } = req.params;

  logger.debug("Processing ad click for: %s", adId);

  try {
    const ip = getClientIp(req);
    const userAgent = req.headers["user-agent"] || "";
    const referrer = req.headers.referer || "";

    const geo = getGeoData(ip);
    const ua = parseUserAgent(userAgent);

    const targetUrl = await recordAdClick(adId, {
      sessionId: "",
      country: geo.country,
      device: ua.device,
      browser: ua.browser,
      referrer: referrer,
    });

    if (targetUrl) {
      const safeUrl = targetUrl.startsWith("http") ? targetUrl : `https://${targetUrl}`;
      return res.redirect(302, safeUrl);
    }

    res.redirect("/");
  } catch (error) {
    logger.error("Error processing ad click %s: %o", adId, error);
    res.redirect("/");
  }
});

export default router;
