import express from "express";
import { showSeoAnalytics, runSeoAnalysis } from "../controllers/seoController.js";

const router = express.Router();

function requireAuth(req, res, next) {
  if (res.locals.user) {
    return next();
  }
  res.redirect("/login");
}

router.get("/dashboard/seo/:websiteId", requireAuth, showSeoAnalytics);
router.post("/dashboard/seo/:websiteId/analyze", requireAuth, runSeoAnalysis);

export default router;
