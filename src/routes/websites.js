import express from "express";
import { showWebsites, addWebsite, archiveWebsite, restoreWebsite, deleteWebsite, getWebsiteSettings, updateWebsiteSettings, addIpToBlacklist, removeIpFromBlacklist, cleanupWebsiteData } from "../controllers/websitesController.js";

const router = express.Router();

function requireAuth(req, res, next) {
  if (res.locals.user) {
    return next();
  }
  res.redirect("/login");
}

router.get("/websites", requireAuth, showWebsites);
router.post("/websites", requireAuth, addWebsite);
router.post("/websites/archive/:id", requireAuth, archiveWebsite);
router.post("/websites/restore/:id", requireAuth, restoreWebsite);
router.post("/websites/delete/:id", requireAuth, deleteWebsite);

router.get("/dashboard/settings/:websiteId", requireAuth, getWebsiteSettings);
router.post("/dashboard/settings/:websiteId", requireAuth, updateWebsiteSettings);
router.post("/dashboard/blacklist/:websiteId/add", requireAuth, addIpToBlacklist);
router.post("/dashboard/blacklist/:websiteId/remove", requireAuth, removeIpFromBlacklist);
router.post("/dashboard/cleanup/:websiteId", requireAuth, cleanupWebsiteData);

export default router;
