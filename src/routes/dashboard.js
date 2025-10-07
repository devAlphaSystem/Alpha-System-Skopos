import express from "express";
import { showDashboard, showWebsites, addWebsite, deleteWebsite, showIndex, getDashboardData } from "../controllers/dashboardController.js";
import { showLoginPage, handleLogin, handleLogout } from "../controllers/authController.js";
import { generateReport } from "../controllers/reportController.js";

const router = express.Router();

function requireAuth(req, res, next) {
  if (res.locals.user) {
    return next();
  }
  res.redirect("/login");
}

router.get("/", requireAuth, showIndex);
router.get("/login", showLoginPage);
router.post("/login", handleLogin);
router.get("/logout", handleLogout);

router.get("/websites", requireAuth, showWebsites);
router.post("/websites", requireAuth, addWebsite);
router.post("/websites/delete/:id", requireAuth, deleteWebsite);

router.get("/dashboard/data/:websiteId", requireAuth, getDashboardData);
router.get("/dashboard/:websiteId/report/pdf", requireAuth, generateReport);
router.get("/dashboard/:websiteId/report/csv", requireAuth, generateReport);
router.get("/dashboard/:websiteId", requireAuth, showDashboard);

export default router;
