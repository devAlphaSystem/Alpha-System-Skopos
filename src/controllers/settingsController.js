import { pbAdmin, ensureAdminAuth } from "../services/pocketbase.js";
import { storeApiKey, listApiKeys, deleteApiKey, getApiKey } from "../services/apiKeyManager.js";
import { listNotificationRules, createNotificationRule, updateNotificationRule, deleteNotificationRule } from "../services/notificationService.js";
import logger from "../utils/logger.js";
import { Resend } from "resend";

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
      discardShortSessions: websites.length > 0 ? websites[0].discardShortSessions || false : false,
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
    const { storeRawIp, discardShortSessions } = req.body;

    if (storeRawIp !== undefined && typeof storeRawIp !== "boolean") {
      return res.status(400).json({ error: "Invalid input for storeRawIp" });
    }

    if (discardShortSessions !== undefined && typeof discardShortSessions !== "boolean") {
      return res.status(400).json({ error: "Invalid input for discardShortSessions" });
    }

    const allWebsites = await pbAdmin.collection("websites").getFullList({
      filter: `user.id = "${res.locals.user.id}"`,
    });

    const updateData = {};
    if (storeRawIp !== undefined) {
      updateData.storeRawIp = storeRawIp;
      logger.debug("Updating storeRawIp to %s for %d websites", storeRawIp, allWebsites.length);
    }
    if (discardShortSessions !== undefined) {
      updateData.discardShortSessions = discardShortSessions;
      logger.debug("Updating discardShortSessions to %s for %d websites", discardShortSessions, allWebsites.length);
    }

    const updatePromises = allWebsites.map((website) => pbAdmin.collection("websites").update(website.id, updateData));

    await Promise.all(updatePromises);

    logger.info("Successfully updated app settings for user %s", res.locals.user.id);
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
    const { name, eventType, recipientEmail, website, customEventName, metadata } = req.body;

    if (!name || !eventType || !recipientEmail) {
      return res.status(400).json({ error: "Name, event type, and recipient email are required" });
    }

    if (eventType === "custom_event" && !customEventName) {
      return res.status(400).json({ error: "Custom event name is required for custom event notifications" });
    }

    let sanitizedMetadata = {};
    if (eventType === "uptime_status") {
      const allowedValues = ["down", "up", "both"];
      const notifyOn = typeof metadata?.notifyOn === "string" ? metadata.notifyOn.toLowerCase() : "";
      sanitizedMetadata = {
        notifyOn: allowedValues.includes(notifyOn) ? notifyOn : "down",
      };
    }

    const rule = await createNotificationRule(res.locals.user.id, {
      name,
      eventType,
      recipientEmail,
      website: website || "",
      customEventName: customEventName || "",
      metadata: sanitizedMetadata,
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

export async function testPageSpeedApi(req, res) {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ success: false, error: "URL is required" });
    }

    const apiKey = await getApiKey(res.locals.user.id, "google_pagespeed");
    if (!apiKey) {
      return res.status(400).json({ success: false, error: "PageSpeed API key not configured" });
    }

    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${apiKey}`;
    const response = await fetch(apiUrl);

    if (!response.ok) {
      let errorMessage = "Failed to test PageSpeed API";
      try {
        const errorData = await response.json();
        errorMessage = errorData.error?.message || errorMessage;
        logger.warn("PageSpeed API test failed for user %s: %o", res.locals.user.id, errorData);
      } catch (e) {
        logger.warn("PageSpeed API test failed for user %s with status %d", res.locals.user.id, response.status);
      }
      return res.status(200).json({
        success: false,
        error: errorMessage,
      });
    }

    const data = await response.json();
    const performanceScore = data.lighthouseResult?.categories?.performance?.score ? Math.round(data.lighthouseResult.categories.performance.score * 100) : null;

    logger.info("PageSpeed API test successful for user %s", res.locals.user.id);
    return res.status(200).json({
      success: true,
      data: {
        performanceScore,
        url: data.lighthouseResult?.finalUrl || url,
      },
    });
  } catch (error) {
    logger.error("Error testing PageSpeed API: %o", error);
    return res.status(200).json({
      success: false,
      error: "Failed to connect to PageSpeed API. Please check your API key.",
    });
  }
}

export async function testChapybaraApi(req, res) {
  try {
    const { ip } = req.body;

    if (!ip) {
      return res.status(400).json({ success: false, error: "IP address is required" });
    }

    const apiKey = await getApiKey(res.locals.user.id, "chapybara");
    if (!apiKey) {
      return res.status(400).json({ success: false, error: "Chapybara API key not configured" });
    }

    const chapybaraUrl = `https://api.chapyapi.com/api/v1/ip/${encodeURIComponent(ip)}`;
    const response = await fetch(chapybaraUrl, {
      headers: {
        "X-API-Key": apiKey,
      },
    });

    if (!response.ok) {
      let errorMessage = "Failed to test Chapybara API";
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorMessage;
        logger.warn("Chapybara API test failed for user %s: %o", res.locals.user.id, errorData);
      } catch (e) {
        logger.warn("Chapybara API test failed for user %s with status %d", res.locals.user.id, response.status);
      }
      return res.status(200).json({
        success: false,
        error: errorMessage,
      });
    }

    const data = await response.json();

    logger.info("Chapybara API test successful for user %s", res.locals.user.id);
    return res.status(200).json({
      success: true,
      data: {
        country: data.country,
        city: data.city,
        isp: data.isp,
      },
    });
  } catch (error) {
    logger.error("Error testing Chapybara API: %o", error);
    return res.status(200).json({
      success: false,
      error: "Failed to connect to Chapybara API. Please check your API key.",
    });
  }
}

export async function testResendApi(req, res) {
  try {
    const { recipient, subject, body } = req.body;

    if (!recipient) {
      return res.status(400).json({ success: false, error: "Recipient email is required" });
    }

    const apiKey = await getApiKey(res.locals.user.id, "resend");
    if (!apiKey) {
      return res.status(400).json({ success: false, error: "Resend API key not configured" });
    }

    const apiKeys = await listApiKeys(res.locals.user.id);
    const resendKey = apiKeys.find((k) => k.service === "resend" && k.isActive);
    const fromEmail = resendKey?.metadata?.fromEmail || "onboarding@resend.dev";

    const resend = new Resend(apiKey);

    const emailData = await resend.emails.send({
      from: fromEmail,
      to: recipient,
      subject: subject || "Skopos Test Email",
      html: body || "<h1>Test Email</h1><p>This is a test email from Skopos to verify your Resend API configuration.</p>",
    });

    if (emailData.error) {
      logger.warn("Resend API test failed for user %s: %o", res.locals.user.id, emailData.error);
      return res.status(200).json({
        success: false,
        error: emailData.error.message || "Failed to send test email",
      });
    }

    logger.info("Resend API test successful for user %s", res.locals.user.id);
    return res.status(200).json({
      success: true,
      data: {
        id: emailData.data?.id,
      },
    });
  } catch (error) {
    logger.error("Error testing Resend API: %o", error);
    return res.status(200).json({
      success: false,
      error: "Failed to send test email. Please check your API key and configuration.",
    });
  }
}

export async function deleteCollectionData(req, res) {
  try {
    const { collections } = req.body;

    if (!Array.isArray(collections) || collections.length === 0) {
      return res.status(400).json({ error: "No collections specified" });
    }

    const allowedCollections = ["api_keys", "dash_sum", "events", "js_errors", "notyf_rules", "seo_data", "sessions", "uptime_checks", "uptime_incidents", "uptime_sum", "visitors", "websites"];

    const validCollections = collections.filter((c) => allowedCollections.includes(c));

    if (validCollections.length === 0) {
      return res.status(400).json({ error: "No valid collections specified" });
    }

    await ensureAdminAuth();

    const deletedCollections = [];
    const failedCollections = [];

    for (const collectionName of validCollections) {
      try {
        await pbAdmin.collections.truncate(collectionName);
        deletedCollections.push(collectionName);
        logger.info("Truncated collection %s", collectionName);
      } catch (error) {
        failedCollections.push(collectionName);
        logger.error("Error truncating collection %s: %o", collectionName, error);
      }
    }

    logger.info("Successfully truncated %d collections", deletedCollections.length);

    if (failedCollections.length > 0) {
      logger.warn("Failed to truncate %d collections: %s", failedCollections.length, failedCollections.join(", "));
    }

    res.json({
      success: true,
      deleted: deletedCollections.length,
      collections: deletedCollections,
      failed: failedCollections.length > 0 ? failedCollections : undefined,
    });
  } catch (error) {
    logger.error("Error deleting collection data: %o", error);
    res.status(500).json({ error: "Failed to delete collection data" });
  }
}
