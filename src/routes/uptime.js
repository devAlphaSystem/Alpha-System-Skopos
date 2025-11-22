import express from "express";
import { showUptime, getUptimeData, performManualCheck, toggleUptimeMonitoring, updateCheckInterval, resolveIncident } from "../controllers/uptimeController.js";
import { detectMobile } from "../utils/deviceDetection.js";

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

router.get("/uptime/:websiteId", requireAuth, blockMobile, showUptime);
router.get("/uptime/:websiteId/data", requireAuth, blockMobile, getUptimeData);
router.post("/uptime/:websiteId/check", requireAuth, blockMobile, performManualCheck);
router.post("/uptime/:websiteId/toggle", requireAuth, blockMobile, toggleUptimeMonitoring);
router.post("/uptime/:websiteId/interval", requireAuth, blockMobile, updateCheckInterval);
router.post("/uptime/:websiteId/incidents/:incidentId/resolve", requireAuth, blockMobile, resolveIncident);

export default router;
