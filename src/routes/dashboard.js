import express from "express";
import { showOverview, showDashboard } from "../controllers/dashboardController.js";

const router = express.Router();

function requireAuth(req, res, next) {
  if (res.locals.user) {
    return next();
  }
  res.redirect("/login");
}

router.get("/", requireAuth, showOverview);
router.get("/dashboard/:websiteId", requireAuth, showDashboard);

export default router;
