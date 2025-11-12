import { pbAdmin, ensureAdminAuth } from "../services/pocketbase.js";
import { storeApiKey, listApiKeys, deleteApiKey } from "../services/apiKeyManager.js";
import { listNotificationRules, createNotificationRule, updateNotificationRule, deleteNotificationRule } from "../services/notificationService.js";
import logger from "../services/logger.js";

export async function showSettings(req, res) {
  logger.info("Rendering settings page for user: %s", res.locals.user.id);
  try {
    await ensureAdminAuth();
    const allWebsites = await pbAdmin.collection("websites").getFullList({
      filter: `user.id = "${res.locals.user.id}"`,
      sort: "created",
    });

    const websites = allWebsites.filter((w) => !w.isArchived);
    logger.debug("Found %d active websites for user %s in settings.", websites.length, res.locals.user.id);

    const apiKeys = await listApiKeys(res.locals.user.id);
    const notificationRules = await listNotificationRules(res.locals.user.id);

    const appSettings = {
      storeRawIp: websites.length > 0 ? websites[0].storeRawIp || false : false,
    };

    res.render("settings", {
      websites,
      appSettings,
      apiKeys,
      notificationRules,
      currentPage: "settings",
    });
  } catch (error) {
    logger.error("Error loading settings for user %s: %o", res.locals.user.id, error);
    res.status(500).render("500");
  }
}

export async function updateAppSettings(req, res) {
  logger.info("Updating app settings for user: %s", res.locals.user.id);
  try {
    await ensureAdminAuth();
    const { storeRawIp } = req.body;

    if (typeof storeRawIp !== "boolean") {
      return res.status(400).json({ error: "Invalid input" });
    }

    const allWebsites = await pbAdmin.collection("websites").getFullList({
      filter: `user.id = "${res.locals.user.id}"`,
    });

    logger.debug("Updating storeRawIp to %s for %d websites", storeRawIp, allWebsites.length);

    const updatePromises = allWebsites.map((website) => pbAdmin.collection("websites").update(website.id, { storeRawIp }));

    await Promise.all(updatePromises);

    logger.info("Successfully updated storeRawIp setting for user %s", res.locals.user.id);
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error("Error updating app settings for user %s: %o", res.locals.user.id, error);
    res.status(500).json({ error: "Failed to update settings" });
  }
}

export async function addApiKey(req, res) {
  try {
    const { service, apiKey, label, metadata } = req.body;

    if (!service || !apiKey) {
      return res.status(400).json({ error: "Service and API key are required" });
    }

    const keyId = await storeApiKey(res.locals.user.id, service, apiKey, label || "", metadata || {});

    logger.info("API key added for service %s by user %s", service, res.locals.user.id);
    res.json({ success: true, keyId });
  } catch (error) {
    logger.error("Error adding API key: %o", error);
    res.status(500).json({ error: "Failed to add API key" });
  }
}

export async function removeApiKey(req, res) {
  try {
    const { keyId } = req.params;

    await deleteApiKey(res.locals.user.id, keyId);

    logger.info("API key %s deleted by user %s", keyId, res.locals.user.id);
    res.json({ success: true });
  } catch (error) {
    logger.error("Error deleting API key: %o", error);
    res.status(500).json({ error: "Failed to delete API key" });
  }
}

export async function getNotificationRules(req, res) {
  try {
    const rules = await listNotificationRules(res.locals.user.id);
    res.json({ success: true, rules });
  } catch (error) {
    logger.error("Error fetching notification rules: %o", error);
    res.status(500).json({ error: "Failed to fetch notification rules" });
  }
}

export async function addNotificationRule(req, res) {
  try {
    const { name, eventType, recipientEmail, website, customEventName } = req.body;

    if (!name || !eventType || !recipientEmail) {
      return res.status(400).json({ error: "Name, event type, and recipient email are required" });
    }

    if (eventType === "custom_event" && !customEventName) {
      return res.status(400).json({ error: "Custom event name is required for custom event notifications" });
    }

    const rule = await createNotificationRule(res.locals.user.id, {
      name,
      eventType,
      recipientEmail,
      website: website || "",
      customEventName: customEventName || "",
    });

    logger.info("Notification rule created by user %s", res.locals.user.id);
    res.json({ success: true, rule });
  } catch (error) {
    logger.error("Error creating notification rule: %o", error);
    res.status(500).json({ error: "Failed to create notification rule" });
  }
}

export async function toggleNotificationRule(req, res) {
  try {
    const { ruleId } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return res.status(400).json({ error: "Invalid input" });
    }

    const rule = await updateNotificationRule(res.locals.user.id, ruleId, { isActive });
    logger.info("Notification rule %s toggled by user %s", ruleId, res.locals.user.id);
    res.json({ success: true, rule });
  } catch (error) {
    logger.error("Error toggling notification rule: %o", error);
    res.status(500).json({ error: "Failed to toggle notification rule" });
  }
}

export async function removeNotificationRule(req, res) {
  try {
    const { ruleId } = req.params;

    await deleteNotificationRule(res.locals.user.id, ruleId);

    logger.info("Notification rule %s deleted by user %s", ruleId, res.locals.user.id);
    res.json({ success: true });
  } catch (error) {
    logger.error("Error deleting notification rule: %o", error);
    res.status(500).json({ error: "Failed to delete notification rule" });
  }
}
