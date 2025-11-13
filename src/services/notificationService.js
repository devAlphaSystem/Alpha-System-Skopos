import { Resend } from "resend";
import { pbAdmin, ensureAdminAuth } from "./pocketbase.js";
import { getApiKey } from "./apiKeyManager.js";
import logger from "./logger.js";

const EMAIL_FONT_STACK = '"Inter", "Segoe UI", Arial, sans-serif';

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

export async function sendNotificationEmail(userId, subject, htmlContent, recipientEmail, fromEmail = null) {
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

export async function getActiveNotificationRules(userId, websiteId = null, eventType = null) {
  try {
    await ensureAdminAuth();

    let filter = `user.id = "${userId}" && isActive = true`;

    if (websiteId) {
      filter += ` && (website.id = "${websiteId}" || website = "")`;
    }

    if (eventType) {
      filter += ` && eventType = "${eventType}"`;
    }

    const rules = await pbAdmin.collection("notyf_rules").getFullList({
      filter: filter,
      sort: "-created",
    });

    logger.debug("Found %d active notification rules for user %s", rules.length, userId);
    return rules;
  } catch (error) {
    logger.error("Error fetching notification rules: %o", error);
    return [];
  }
}

export async function triggerNotification(userId, websiteId, eventType, eventData = {}) {
  try {
    const rules = await getActiveNotificationRules(userId, websiteId, eventType);

    if (rules.length === 0) {
      logger.debug("No active notification rules found for event %s", eventType);
      return;
    }

    for (const rule of rules) {
      if (eventType === "custom_event" && rule.customEventName) {
        if (eventData.eventName !== rule.customEventName) {
          continue;
        }
      }

      const { subject, htmlContent } = generateEmailContent(eventType, eventData, rule);
      const sent = await sendNotificationEmail(userId, subject, htmlContent, rule.recipientEmail);

      if (sent) {
        await ensureAdminAuth();
        await pbAdmin.collection("notyf_rules").update(rule.id, {
          lastTriggered: new Date().toISOString(),
          triggerCount: (rule.triggerCount || 0) + 1,
        });

        logger.info("Notification sent for rule %s (event: %s)", rule.id, eventType);
      }
    }
  } catch (error) {
    logger.error("Error triggering notification: %o", error);
  }
}

function generateEmailContent(eventType, eventData, rule) {
  const websiteName = eventData.websiteName || "Your Website";

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
            <h3 style="margin-top: 0;">Today's Metrics:</h3>
            <ul style="list-style: none; padding: 0;">
              <li><strong>Page Views:</strong> ${eventData.pageViews || 0}</li>
              <li><strong>Unique Visitors:</strong> ${eventData.uniqueVisitors || 0}</li>
              <li><strong>New Visitors:</strong> ${eventData.newVisitors || 0}</li>
              <li><strong>Sessions:</strong> ${eventData.sessions || 0}</li>
            </ul>
          </div>
          <p style="color: #6B7280; font-size: 14px;">
            Date: ${new Date().toLocaleDateString()}
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
      website: ruleData.website || "",
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
    const rule = await pbAdmin.collection("notyf_rules").update(ruleId, updates);
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
