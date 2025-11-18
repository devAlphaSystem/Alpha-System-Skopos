import express from "express";
import { showSettings, updateAppSettings, addApiKey, removeApiKey, getNotificationRules, addNotificationRule, toggleNotificationRule, removeNotificationRule, testPageSpeedApi, testChapybaraApi, testResendApi, deleteCollectionData } from "../controllers/settingsController.js";

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
router.get("/settings/notifications", requireAuth, getNotificationRules);
router.post("/settings/notifications", requireAuth, addNotificationRule);
router.patch("/settings/notifications/:ruleId", requireAuth, toggleNotificationRule);
router.delete("/settings/notifications/:ruleId", requireAuth, removeNotificationRule);
router.post("/settings/test-api/pagespeed", requireAuth, testPageSpeedApi);
router.post("/settings/test-api/chapybara", requireAuth, testChapybaraApi);
router.post("/settings/test-api/resend", requireAuth, testResendApi);
router.post("/settings/delete-collections", requireAuth, deleteCollectionData);

export default router;
