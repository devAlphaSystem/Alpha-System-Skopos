import { pbAdmin, ensureAdminAuth } from "../services/pocketbase.js";
import { storeApiKey, listApiKeys, deleteApiKey } from "../services/apiKeyManager.js";
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

    const appSettings = {
      storeRawIp: websites.length > 0 ? websites[0].storeRawIp || false : false,
    };

    res.render("settings", {
      websites,
      appSettings,
      apiKeys,
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
