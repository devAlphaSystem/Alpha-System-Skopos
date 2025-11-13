import express from "express";
import { showUptime, getUptimeData, performManualCheck, toggleUptimeMonitoring, updateCheckInterval, resolveIncident } from "../controllers/uptimeController.js";

const router = express.Router();

function requireAuth(req, res, next) {
  if (res.locals.user) {
    return next();
  }
  res.redirect("/login");
}

router.get("/uptime/:websiteId", requireAuth, showUptime);
router.get("/uptime/:websiteId/data", requireAuth, getUptimeData);
router.post("/uptime/:websiteId/check", requireAuth, performManualCheck);
router.post("/uptime/:websiteId/toggle", requireAuth, toggleUptimeMonitoring);
router.post("/uptime/:websiteId/interval", requireAuth, updateCheckInterval);
router.post("/uptime/:websiteId/incidents/:incidentId/resolve", requireAuth, resolveIncident);

export default router;
