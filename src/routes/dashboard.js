import express from "express";
import { showDashboard, showWebsites, addWebsite, deleteWebsite, showOverview, getDashboardData, getDetailedReport, getCustomEventDetails, updateWebsiteSettings, getWebsiteSettings, addIpToBlacklist, removeIpFromBlacklist, getOverviewData, archiveWebsite, restoreWebsite } from "../controllers/dashboardController.js";
import { showLoginPage, handleLogin, handleLogout, showRegistrationPage, handleRegistration } from "../controllers/authController.js";

const router = express.Router();

function requireAuth(req, res, next) {
  if (res.locals.user) {
    return next();
  }
  res.redirect("/login");
}

router.get("/register", showRegistrationPage);
router.post("/register", handleRegistration);
router.get("/login", showLoginPage);
router.post("/login", handleLogin);
router.get("/logout", handleLogout);

router.get("/", requireAuth, showOverview);

router.get("/websites", requireAuth, showWebsites);
router.post("/websites", requireAuth, addWebsite);
router.post("/websites/archive/:id", requireAuth, archiveWebsite);
router.post("/websites/restore/:id", requireAuth, restoreWebsite);
router.post("/websites/delete/:id", requireAuth, deleteWebsite);

router.get("/overview/data", requireAuth, getOverviewData);
router.get("/dashboard/data/:websiteId", requireAuth, getDashboardData);
router.get("/dashboard/report/:websiteId/custom-event-details", requireAuth, getCustomEventDetails);
router.get("/dashboard/report/:websiteId/:reportType", requireAuth, getDetailedReport);
router.get("/dashboard/:websiteId", requireAuth, showDashboard);

router.get("/dashboard/settings/:websiteId", requireAuth, getWebsiteSettings);
router.post("/dashboard/settings/:websiteId", requireAuth, updateWebsiteSettings);
router.post("/dashboard/blacklist/:websiteId/add", requireAuth, addIpToBlacklist);
router.post("/dashboard/blacklist/:websiteId/remove", requireAuth, removeIpFromBlacklist);

export default router;
