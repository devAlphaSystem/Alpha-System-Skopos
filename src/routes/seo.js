import express from "express";
import { showSeoAnalytics, runSeoAnalysis, exportSeoAnalytics } from "../controllers/seoController.js";
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

router.get("/dashboard/seo/:websiteId", requireAuth, blockMobile, showSeoAnalytics);
router.post("/dashboard/seo/:websiteId/analyze", requireAuth, blockMobile, runSeoAnalysis);
router.get("/dashboard/seo/:websiteId/export", requireAuth, blockMobile, exportSeoAnalytics);

export default router;
