import express from "express";
import { showSettings, updateAppSettings, addApiKey, removeApiKey } from "../controllers/settingsController.js";

const router = express.Router();

function requireAuth(req, res, next) {
  if (res.locals.user) {
    return next();
  }
  res.redirect("/login");
}

router.get("/settings", requireAuth, showSettings);
router.post("/settings/app", requireAuth, updateAppSettings);
router.post("/settings/api-keys", requireAuth, addApiKey);
router.delete("/settings/api-keys/:keyId", requireAuth, removeApiKey);

export default router;
