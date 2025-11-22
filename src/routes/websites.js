import express from "express";
import { showWebsites, addWebsite, archiveWebsite, restoreWebsite, deleteWebsite, getWebsiteSettings, updateWebsiteSettings, addIpToBlacklist, removeIpFromBlacklist, cleanupWebsiteData } from "../controllers/websitesController.js";
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

router.get("/websites", requireAuth, blockMobile, showWebsites);
router.post("/websites", requireAuth, blockMobile, addWebsite);
router.post("/websites/archive/:id", requireAuth, blockMobile, archiveWebsite);
router.post("/websites/restore/:id", requireAuth, blockMobile, restoreWebsite);
router.post("/websites/delete/:id", requireAuth, blockMobile, deleteWebsite);

router.get("/dashboard/settings/:websiteId", requireAuth, blockMobile, getWebsiteSettings);
router.post("/dashboard/settings/:websiteId", requireAuth, blockMobile, updateWebsiteSettings);
router.post("/dashboard/blacklist/:websiteId/add", requireAuth, blockMobile, addIpToBlacklist);
router.post("/dashboard/blacklist/:websiteId/remove", requireAuth, blockMobile, removeIpFromBlacklist);
router.post("/dashboard/cleanup/:websiteId", requireAuth, blockMobile, cleanupWebsiteData);

export default router;
