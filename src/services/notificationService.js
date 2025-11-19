import { Resend } from "resend";
import { pbAdmin, ensureAdminAuth } from "./pocketbase.js";
import { getApiKey } from "./apiKeyManager.js";
import logger from "../utils/logger.js";

const EMAIL_FONT_STACK = '"Inter", "Segoe UI", Arial, sans-serif';
const RESEND_MAX_RETRIES = 3;
const RESEND_BASE_DELAY_MS = 600;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatNumber(value, fallback = "0") {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return num.toLocaleString();
}

function formatPercentage(value, fallback = "N/A") {
  if (value === null || value === undefined) {
    return fallback;
  }
  return `${value}%`;
}

function renderBreakdownList(items, emptyLabel) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<li style="color: #6B7280; font-style: italic;">${emptyLabel}</li>`;
  }

  return items
    .map((item) => {
      const count = Number(item?.count);
      const label = item?.label || item?.key || "Unknown";
      const percentage = item?.percentage !== null && item?.percentage !== undefined ? ` - ${item.percentage}%` : "";
      const countText = Number.isFinite(count) ? count.toLocaleString() : "0";
      return `<li><strong>${label}:</strong> ${countText}${percentage}</li>`;
    })
    .join("");
}

function normalizeWebsiteSelection(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  return [value];
}

async function getResendClient(userId) {
  try {
    const apiKey = await getApiKey(userId, "resend");
    if (!apiKey) {
      logger.warn("No Resend API key found for user %s", userId);
      return null;
    }
    return new Resend(apiKey);
  } catch (error) {
    logger.error("Error initializing Resend client: %o", error);
    return null;
  }
}

export async function sendNotificationEmail(userId, subject, htmlContent, recipientEmail, fromEmail = null, retryAttempt = 0) {
  try {
    const resend = await getResendClient(userId);
    if (!resend) {
      logger.warn("Cannot send email - Resend not configured for user %s", userId);
      return false;
    }

    let senderEmail = fromEmail;
    if (!senderEmail) {
      await ensureAdminAuth();
      const apiKey = await pbAdmin.collection("api_keys").getFirstListItem(`user="${userId}" && service="resend" && isActive=true`, { requestKey: null });
      senderEmail = apiKey?.metadata?.fromEmail || "Skopos Analytics <notifications@resend.dev>";
    }

    const { data, error } = await resend.emails.send({
      from: senderEmail,
      to: recipientEmail,
      subject: subject,
      html: htmlContent,
    });

    if (error) {
      if (error.statusCode === 429 && retryAttempt < RESEND_MAX_RETRIES) {
        const delayMs = RESEND_BASE_DELAY_MS * 2 ** retryAttempt;
        logger.warn("Resend rate limit hit for user %s (attempt %d). Retrying in %dms...", userId, retryAttempt + 1, delayMs);
        await delay(delayMs);
        return sendNotificationEmail(userId, subject, htmlContent, recipientEmail, senderEmail, retryAttempt + 1);
      }

      logger.error("Error sending email via Resend: %o", error);
      return false;
    }

    logger.info("Email sent successfully via Resend: %s", data?.id);
    return true;
  } catch (error) {
    logger.error("Exception sending email: %o", error);
    return false;
  }
}

function ruleMatchesWebsite(rule, websiteId) {
  if (!websiteId) {
    return true;
  }

  const websiteField = rule.website;

  if (!websiteField || (Array.isArray(websiteField) && websiteField.length === 0)) {
    return true;
  }

  const websiteIds = Array.isArray(websiteField) ? websiteField : [websiteField];
  return websiteIds.includes(websiteId);
}

export async function getActiveNotificationRules(userId, websiteId = null, eventType = null) {
  try {
    await ensureAdminAuth();

    let filter = `user.id = "${userId}" && isActive = true`;

    if (eventType) {
      filter += ` && eventType = "${eventType}"`;
    }

    const rules = await pbAdmin.collection("notyf_rules").getFullList({
      filter: filter,
      sort: "-created",
    });

    const filteredRules = websiteId ? rules.filter((rule) => ruleMatchesWebsite(rule, websiteId)) : rules;

    logger.debug("Found %d active notification rules for user %s", filteredRules.length, userId);
    return filteredRules;
  } catch (error) {
    logger.error("Error fetching notification rules: %o", error);
    return [];
  }
}

export async function triggerNotification(userId, websiteId, eventType, eventData = {}, options = {}) {
  try {
    let rules;

    if (options.ruleOverride) {
      rules = [options.ruleOverride];
    } else if (options.rulesOverride) {
      rules = options.rulesOverride;
    } else {
      rules = await getActiveNotificationRules(userId, websiteId, eventType);
    }

    if (!options.includeInactive) {
      rules = rules.filter((rule) => rule.isActive !== false);
    }

    if (rules.length === 0) {
      logger.debug("No active notification rules found for event %s", eventType);
      return;
    }

    for (const rule of rules) {
      if (!shouldTriggerRule(rule, eventType, eventData)) {
        continue;
      }

      const { subject, htmlContent } = generateEmailContent(eventType, eventData, rule);
      const sent = await sendNotificationEmail(userId, subject, htmlContent, rule.recipientEmail);

      if (sent) {
        await ensureAdminAuth();
        const nextTriggerCount = (rule.triggerCount || 0) + 1;
        await pbAdmin.collection("notyf_rules").update(rule.id, {
          lastTriggered: new Date().toISOString(),
          triggerCount: nextTriggerCount,
        });
        rule.triggerCount = nextTriggerCount;

        logger.info("Notification sent for rule %s (event: %s)", rule.id, eventType);
      }
    }
  } catch (error) {
    logger.error("Error triggering notification: %o", error);
  }
}

function generateEmailContent(eventType, eventData, rule) {
  const websiteName = eventData.websiteName || "Your Website";
  const currentStatus = eventData.currentStatus || "";
  const isDowntimeAlert = eventType === "uptime_status" && currentStatus === "down";
  const uptimeAccent = isDowntimeAlert ? "#DC2626" : "#10B981";
  const uptimeBackground = isDowntimeAlert ? "#FEE2E2" : "#D1FAE5";
  const reportDateLabel = eventData.reportDate ? new Date(eventData.reportDate).toLocaleDateString() : new Date().toLocaleDateString();

  const templates = {
    new_visitor: {
      subject: `New Visitor on ${websiteName}`,
      html: `
        <div style="font-family: ${EMAIL_FONT_STACK}; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4F46E5;">New Visitor Alert</h2>
          <p>A new visitor has been detected on <strong>${websiteName}</strong>.</p>
          <div style="background: #F3F4F6; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Visitor Details:</h3>
            <ul style="list-style: none; padding: 0;">
              <li><strong>Location:</strong> ${eventData.country || "Unknown"}, ${eventData.state || ""}</li>
              <li><strong>Device:</strong> ${eventData.device || "Unknown"}</li>
              <li><strong>Browser:</strong> ${eventData.browser || "Unknown"}</li>
              <li><strong>Entry Path:</strong> ${eventData.entryPath || "/"}</li>
              <li><strong>Referrer:</strong> ${eventData.referrer || "Direct"}</li>
            </ul>
          </div>
          <p style="color: #6B7280; font-size: 14px;">
            Time: ${new Date().toLocaleString()}
          </p>
        </div>
      `,
    },
    custom_event: {
      subject: `Custom Event "${eventData.eventName}" Triggered on ${websiteName}`,
      html: `
        <div style="font-family: ${EMAIL_FONT_STACK}; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4F46E5;">Custom Event Triggered</h2>
          <p>The custom event <strong>"${eventData.eventName}"</strong> has been triggered on ${websiteName}.</p>
          <div style="background: #F3F4F6; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Event Details:</h3>
            <ul style="list-style: none; padding: 0;">
              <li><strong>Event Name:</strong> ${eventData.eventName}</li>
              <li><strong>Path:</strong> ${eventData.path || "/"}</li>
              ${eventData.eventData ? `<li><strong>Data:</strong> <pre style="background: white; padding: 10px; border-radius: 4px; overflow-x: auto;">${JSON.stringify(eventData.eventData, null, 2)}</pre></li>` : ""}
            </ul>
          </div>
          <p style="color: #6B7280; font-size: 14px;">
            Time: ${new Date().toLocaleString()}
          </p>
        </div>
      `,
    },
    new_session: {
      subject: `New Session Started on ${websiteName}`,
      html: `
        <div style="font-family: ${EMAIL_FONT_STACK}; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4F46E5;">New Session Alert</h2>
          <p>A new session has been started on <strong>${websiteName}</strong>.</p>
          <div style="background: #F3F4F6; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Session Details:</h3>
            <ul style="list-style: none; padding: 0;">
              <li><strong>Device:</strong> ${eventData.device || "Unknown"}</li>
              <li><strong>Browser:</strong> ${eventData.browser || "Unknown"}</li>
              <li><strong>OS:</strong> ${eventData.os || "Unknown"}</li>
              <li><strong>Location:</strong> ${eventData.country || "Unknown"}</li>
            </ul>
          </div>
          <p style="color: #6B7280; font-size: 14px;">
            Time: ${new Date().toLocaleString()}
          </p>
        </div>
      `,
    },
    daily_summary: {
      subject: `Daily Summary for ${websiteName}`,
      html: `
        <div style="font-family: ${EMAIL_FONT_STACK}; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4F46E5;">Daily Analytics Summary</h2>
          <p>Here's your daily summary for <strong>${websiteName}</strong>.</p>
          <div style="background: #F3F4F6; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Key Metrics</h3>
            <ul style="list-style: none; padding: 0; margin: 0;">
              <li><strong>Page Views:</strong> ${formatNumber(eventData.pageViews)}</li>
              <li><strong>Unique Visitors:</strong> ${formatNumber(eventData.uniqueVisitors)}</li>
              <li><strong>New Visitors:</strong> ${formatNumber(eventData.newVisitors)}</li>
              <li><strong>Returning Visitors:</strong> ${formatNumber(eventData.returningVisitors)}</li>
              <li><strong>Sessions:</strong> ${formatNumber(eventData.sessions)}</li>
              <li><strong>Engaged Sessions:</strong> ${formatNumber(eventData.engagedSessions)}</li>
              <li><strong>Engagement Rate:</strong> ${formatPercentage(eventData.engagementRate)}</li>
              <li><strong>Bounce Rate:</strong> ${formatPercentage(eventData.bounceRate)}</li>
              <li><strong>Avg. Session Duration:</strong> ${eventData.avgSessionDuration || "00:00"}</li>
              <li><strong>JS Errors:</strong> ${formatNumber(eventData.jsErrors)}</li>
            </ul>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 12px;">
            <div style="flex: 1 1 160px; background: #FFFFFF; border: 1px solid #E5E7EB; padding: 12px; border-radius: 8px;">
              <h4 style="margin: 0 0 8px; color: #374151;">Top Pages</h4>
              <ul style="list-style: none; padding: 0; margin: 0;">
                ${renderBreakdownList(eventData.topPages, "No page data yet.")}
              </ul>
            </div>
            <div style="flex: 1 1 160px; background: #FFFFFF; border: 1px solid #E5E7EB; padding: 12px; border-radius: 8px;">
              <h4 style="margin: 0 0 8px; color: #374151;">Top Referrers</h4>
              <ul style="list-style: none; padding: 0; margin: 0;">
                ${renderBreakdownList(eventData.topReferrers, "No referrer data yet.")}
              </ul>
            </div>
            <div style="flex: 1 1 160px; background: #FFFFFF; border: 1px solid #E5E7EB; padding: 12px; border-radius: 8px;">
              <h4 style="margin: 0 0 8px; color: #374151;">Device Breakdown</h4>
              <ul style="list-style: none; padding: 0; margin: 0;">
                ${renderBreakdownList(eventData.deviceBreakdown, "No device data yet.")}
              </ul>
            </div>
          </div>
          <p style="color: #6B7280; font-size: 14px; margin-top: 16px;">
            Date: ${reportDateLabel}
          </p>
        </div>
      `,
    },
    error_threshold: {
      subject: `Error Threshold Exceeded on ${websiteName}`,
      html: `
        <div style="font-family: ${EMAIL_FONT_STACK}; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #DC2626;">Error Threshold Alert</h2>
          <p>The error threshold has been exceeded on <strong>${websiteName}</strong>.</p>
          <div style="background: #FEE2E2; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #DC2626;">
            <h3 style="margin-top: 0; color: #DC2626;">Error Details:</h3>
            <ul style="list-style: none; padding: 0;">
              <li><strong>Error Count:</strong> ${eventData.errorCount || 0}</li>
              <li><strong>Threshold:</strong> ${eventData.threshold || 10}</li>
              <li><strong>Most Common Error:</strong> ${eventData.topError || "N/A"}</li>
            </ul>
          </div>
          <p style="color: #6B7280; font-size: 14px;">
            Time: ${new Date().toLocaleString()}
          </p>
        </div>
      `,
    },
    traffic_spike: {
      subject: `Traffic Spike Detected on ${websiteName}`,
      html: `
        <div style="font-family: ${EMAIL_FONT_STACK}; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #10B981;">Traffic Spike Alert</h2>
          <p>A significant traffic spike has been detected on <strong>${websiteName}</strong>.</p>
          <div style="background: #D1FAE5; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10B981;">
            <h3 style="margin-top: 0; color: #10B981;">Traffic Details:</h3>
            <ul style="list-style: none; padding: 0;">
              <li><strong>Current Visitors:</strong> ${eventData.currentVisitors || 0}</li>
              <li><strong>Average Visitors:</strong> ${eventData.averageVisitors || 0}</li>
              <li><strong>Increase:</strong> ${eventData.increase || 0}%</li>
            </ul>
          </div>
          <p style="color: #6B7280; font-size: 14px;">
            Time: ${new Date().toLocaleString()}
          </p>
        </div>
      `,
    },
    uptime_status: {
      subject: `Uptime Alert: ${websiteName} is ${currentStatus === "down" ? "DOWN" : "UP"}`,
      html: `
        <div style="font-family: ${EMAIL_FONT_STACK}; max-width: 600px; margin: 0 auto;">
          <h2 style="color: ${uptimeAccent};">Website ${currentStatus === "down" ? "Down" : "Recovered"}</h2>
          <p>${websiteName} (${eventData.websiteDomain || "unknown domain"}) is currently <strong>${currentStatus === "down" ? "UNAVAILABLE" : "ONLINE"}</strong>.</p>
          <div style="background: ${uptimeBackground}; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${uptimeAccent};">
            <h3 style="margin-top: 0; color: ${uptimeAccent};">Status Details</h3>
            <ul style="list-style: none; padding: 0; font-size: 0.95rem;">
              <li><strong>Current Status:</strong> ${currentStatus || "Unknown"}</li>
              ${eventData.previousStatus ? `<li><strong>Previous Status:</strong> ${eventData.previousStatus}</li>` : ""}
              ${eventData.timestamp ? `<li><strong>Detected:</strong> ${new Date(eventData.timestamp).toLocaleString()}</li>` : ""}
              ${eventData.downtimeStartedAt ? `<li><strong>Downtime Started:</strong> ${new Date(eventData.downtimeStartedAt).toLocaleString()}</li>` : ""}
              ${eventData.downtimeEndedAt ? `<li><strong>Downtime Ended:</strong> ${new Date(eventData.downtimeEndedAt).toLocaleString()}</li>` : ""}
              ${eventData.durationMinutes !== undefined ? `<li><strong>Downtime Duration:</strong> ${eventData.durationMinutes} minute(s)</li>` : ""}
              ${eventData.statusCode ? `<li><strong>Status Code:</strong> ${eventData.statusCode}</li>` : ""}
              ${eventData.responseTime ? `<li><strong>Response Time:</strong> ${eventData.responseTime} ms</li>` : ""}
              ${eventData.errorMessage ? `<li><strong>Error:</strong> ${eventData.errorMessage}</li>` : ""}
            </ul>
          </div>
          <p style="color: #6B7280; font-size: 0.875rem;">
            Incident ID: ${eventData.incidentId || "N/A"}
          </p>
        </div>
      `,
    },
  };

  const template = templates[eventType] || {
    subject: `Notification from ${websiteName}`,
    html: `
        <div style="font-family: ${EMAIL_FONT_STACK}; max-width: 600px; margin: 0 auto;">
          <p>Event: ${eventType}</p>
          <pre style="background: #F3F4F6; padding: 10px; border-radius: 4px; overflow-x: auto;">${JSON.stringify(eventData, null, 2)}</pre>
        </div>
      `,
  };

  return {
    subject: template.subject,
    htmlContent: template.html,
  };
}

function shouldTriggerRule(rule, eventType, eventData) {
  if (eventType === "custom_event" && rule.customEventName) {
    return eventData.eventName === rule.customEventName;
  }

  if (eventType === "uptime_status") {
    const notifyOn = (rule.metadata?.notifyOn || "down").toLowerCase();
    const status = (eventData.currentStatus || "").toLowerCase();

    if (notifyOn === "both") {
      return status === "down" || status === "up";
    }

    if (notifyOn === "up" || notifyOn === "down") {
      return status === notifyOn;
    }

    return false;
  }

  return true;
}

export async function listNotificationRules(userId) {
  try {
    await ensureAdminAuth();
    const rules = await pbAdmin.collection("notyf_rules").getFullList({
      filter: `user.id = "${userId}"`,
      sort: "-created",
      expand: "website",
    });
    return rules;
  } catch (error) {
    logger.error("Error listing notification rules: %o", error);
    return [];
  }
}

export async function createNotificationRule(userId, ruleData) {
  try {
    await ensureAdminAuth();
    const rule = await pbAdmin.collection("notyf_rules").create({
      user: userId,
      website: normalizeWebsiteSelection(ruleData.website),
      name: ruleData.name,
      eventType: ruleData.eventType,
      recipientEmail: ruleData.recipientEmail,
      customEventName: ruleData.customEventName || "",
      metadata: ruleData.metadata || {},
      isActive: true,
      triggerCount: 0,
    });
    logger.info("Notification rule created: %s", rule.id);
    return rule;
  } catch (error) {
    logger.error("Error creating notification rule: %o", error);
    throw error;
  }
}

export async function updateNotificationRule(userId, ruleId, updates) {
  try {
    await ensureAdminAuth();
    const payload = {
      ...updates,
    };

    if (Object.prototype.hasOwnProperty.call(updates, "website")) {
      payload.website = normalizeWebsiteSelection(updates.website);
    }

    const rule = await pbAdmin.collection("notyf_rules").update(ruleId, payload);
    logger.info("Notification rule updated: %s", ruleId);
    return rule;
  } catch (error) {
    logger.error("Error updating notification rule: %o", error);
    throw error;
  }
}

export async function deleteNotificationRule(userId, ruleId) {
  try {
    await ensureAdminAuth();
    await pbAdmin.collection("notyf_rules").delete(ruleId);
    logger.info("Notification rule deleted: %s", ruleId);
    return true;
  } catch (error) {
    logger.error("Error deleting notification rule: %o", error);
    throw error;
  }
}
