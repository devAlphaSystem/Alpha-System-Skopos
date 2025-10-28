import express from "express";
import { handleSseConnection, getOverviewData, getDashboardData, getDetailedReport, getCustomEventDetails, getUserIp } from "../controllers/apiController.js";

const router = express.Router();

function requireAuth(req, res, next) {
  if (res.locals.user) {
    return next();
  }
  res.status(401).json({ error: "Unauthorized" });
}

router.get("/dashboard/events", requireAuth, handleSseConnection);

router.get("/overview/data", requireAuth, getOverviewData);
router.get("/dashboard/data/:websiteId", requireAuth, getDashboardData);
router.get("/dashboard/report/:websiteId/custom-event-details", requireAuth, getCustomEventDetails);
router.get("/dashboard/report/:websiteId/:reportType", requireAuth, getDetailedReport);

router.get("/api/user-ip", requireAuth, getUserIp);

export default router;
