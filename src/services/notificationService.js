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
    return `<li style="color: #6B7280; font-style: italic; font-size: 13px; padding: 12px 0;">${emptyLabel}</li>`;
  }

  const maxCount = Math.max(...items.map((i) => Number(i.count || 0)), 1);

  return items
    .slice(0, 5)
    .map((item) => {
      const count = Number(item?.count);
      const label = item?.label || item?.key || "Unknown";
      const percentage = item?.percentage !== null && item?.percentage !== undefined ? item.percentage : null;
      const countText = Number.isFinite(count) ? count.toLocaleString() : "0";
      const barWidth = Math.round((count / maxCount) * 100);

      return `
      <li style="padding: 12px 0; border-bottom: 1px solid #F3F4F6;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 13px;">
          <span style="color: #374151; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 75%;">${label}</span>
          <span style="color: #111827; font-weight: 700;">${countText} ${percentage !== null ? `<small style="color: #9CA3AF; font-weight: 400; margin-left: 4px;">(${percentage}%)</small>` : ""}</span>
        </div>
        <div style="width: 100%; height: 6px; background: #F3F4F6; border-radius: 3px; overflow: hidden;">
          <div style="width: ${barWidth}%; height: 100%; background: #4F46E5; border-radius: 3px;"></div>
        </div>
      </li>`;
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

function renderEmailWrapper(content, title, websiteName = "Skopos") {
  const dashboardUrl = process.env.APP_URL || "http://localhost:3000";

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
          line-height: 1.6; 
          color: #1F2937; 
          background-color: #F9FAFB;
          margin: 0;
          padding: 0;
          -webkit-font-smoothing: antialiased;
        }
        .container { 
          max-width: 600px; 
          margin: 0 auto; 
          padding: 40px 20px;
        }
        .header {
          padding-bottom: 24px;
          text-align: center;
        }
        .logo {
          font-size: 20px;
          font-weight: 800;
          color: #4F46E5;
          text-decoration: none;
          letter-spacing: -0.025em;
          text-transform: uppercase;
        }
        .card { 
          background: #ffffff; 
          border-radius: 12px; 
          padding: 32px; 
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
          border: 1px solid #E5E7EB;
        }
        .badge {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 20px;
        }
        .footer { 
          text-align: center; 
          padding: 32px 20px; 
          color: #9CA3AF; 
          font-size: 12px;
        }
        .footer a {
          color: #4F46E5;
          text-decoration: none;
          font-weight: 500;
        }
        h1, h2, h3 { 
          color: #111827; 
          margin: 0 0 16px 0;
          font-weight: 700;
          letter-spacing: -0.025em;
          line-height: 1.2;
        }
        h2 { font-size: 24px; }
        p { margin: 0 0 16px 0; font-size: 15px; color: #4B5563; }
        .details-list {
          list-style: none;
          padding: 0;
          margin: 24px 0;
          background: #F9FAFB;
          border-radius: 8px;
          padding: 16px;
          border: 1px solid #F3F4F6;
        }
        .details-list li {
          margin-bottom: 12px;
          display: flex;
          justify-content: space-between;
          font-size: 14px;
        }
        .details-list li:last-child {
          margin-bottom: 0;
        }
        .label {
          color: #6B7280;
          font-weight: 500;
        }
        .value {
          color: #111827;
          font-weight: 600;
          text-align: right;
        }
        .button {
          display: inline-block;
          background: #4F46E5;
          color: #ffffff !important;
          padding: 12px 32px;
          border-radius: 9999px;
          text-decoration: none;
          font-weight: 600;
          font-size: 14px;
          margin-top: 24px;
          box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2);
          text-align: center;
        }
        .metric-grid {
          margin: 24px 0;
        }
        .metric-card {
          display: inline-block;
          width: 44%;
          background: #F9FAFB;
          padding: 16px;
          border-radius: 8px;
          border: 1px solid #F3F4F6;
          margin: 2%;
          vertical-align: top;
        }
        .metric-label {
          font-size: 11px;
          color: #6B7280;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-weight: 600;
        }
        .metric-value {
          font-size: 20px;
          font-weight: 700;
          color: #111827;
          margin-top: 4px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <a href="${dashboardUrl}" class="logo">SKOPOS</a>
        </div>
        <div class="card">
          ${content.replace(/href="#"/g, `href="${dashboardUrl}"`)}
        </div>
        <div class="footer">
          <p>
            Sent via <strong>Skopos</strong> for ${websiteName}.<br>
            Manage notifications in your <a href="${dashboardUrl}/settings">Dashboard</a>.
          </p>
          <p>&copy; ${new Date().getFullYear()} Skopos Analytics. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export function generateEmailContent(eventType, eventData, rule) {
  const websiteName = eventData.websiteName || "Your Website";
  const currentStatus = eventData.currentStatus || "";
  const isDowntimeAlert = eventType === "uptime_status" && currentStatus === "down";
  const reportDateLabel = eventData.reportDate ? new Date(eventData.reportDate).toLocaleDateString() : new Date().toLocaleDateString();

  const templates = {
    new_visitor: {
      subject: `New Visitor on ${websiteName}`,
      html: renderEmailWrapper(
        `
        <div class="badge" style="background: #E0E7FF; color: #4338CA;">Traffic Alert</div>
        <h2>New Visitor Detected</h2>
        <p>A new visitor is exploring <strong>${websiteName}</strong> right now.</p>
        
        <ul class="details-list">
          <li><span class="label">Location</span> <span class="value">${eventData.country || "Unknown"}, ${eventData.state || ""}</span></li>
          <li><span class="label">Device</span> <span class="value">${eventData.device || "Unknown"}</span></li>
          <li><span class="label">Browser</span> <span class="value">${eventData.browser || "Unknown"}</span></li>
          <li><span class="label">Entry Path</span> <span class="value">${eventData.entryPath || "/"}</span></li>
          <li><span class="label">Referrer</span> <span class="value">${eventData.referrer || "Direct"}</span></li>
          <li><span class="label">Time</span> <span class="value">${new Date().toLocaleTimeString()}</span></li>
        </ul>

        <div style="text-align: center;">
          <a href="#" class="button">View Live Session</a>
        </div>
      `,
        "New Visitor Alert",
        websiteName,
      ),
    },
    custom_event: {
      subject: `Custom Event "${eventData.eventName}" Triggered on ${websiteName}`,
      html: renderEmailWrapper(
        `
        <div class="badge" style="background: #FEF3C7; color: #92400E;">Custom Event</div>
        <h2>Event: ${eventData.eventName}</h2>
        <p>A custom event has been triggered on <strong>${websiteName}</strong>.</p>
        
        <ul class="details-list">
          <li><span class="label">Event Name</span> <span class="value">${eventData.eventName}</span></li>
          <li><span class="label">Path</span> <span class="value">${eventData.path || "/"}</span></li>
          <li><span class="label">Detected</span> <span class="value">${new Date().toLocaleTimeString()}</span></li>
        </ul>

        ${
          eventData.eventData
            ? `
          <h3 style="font-size: 14px; margin-bottom: 8px;">Event Metadata:</h3>
          <pre style="background: #F3F4F6; padding: 12px; border-radius: 8px; font-size: 13px; overflow-x: auto;">${JSON.stringify(eventData.eventData, null, 2)}</pre>
        `
            : ""
        }

        <div style="text-align: center;">
          <a href="#" class="button">Analyze Events</a>
        </div>
      `,
        "Custom Event Triggered",
        websiteName,
      ),
    },
    new_session: {
      subject: `New Session Started on ${websiteName}`,
      html: renderEmailWrapper(
        `
        <div class="badge" style="background: #E0E7FF; color: #4338CA;">Traffic Alert</div>
        <h2>New Session Started</h2>
        <p>A visitor has started a new session on <strong>${websiteName}</strong>.</p>
        
        <ul class="details-list">
          <li><span class="label">Location</span> <span class="value">${eventData.country || "Unknown"}</span></li>
          <li><span class="label">Device</span> <span class="value">${eventData.device || "Unknown"}</span></li>
          <li><span class="label">Browser</span> <span class="value">${eventData.browser || "Unknown"}</span></li>
          <li><span class="label">OS</span> <span class="value">${eventData.os || "Unknown"}</span></li>
          <li><span class="label">Time</span> <span class="value">${new Date().toLocaleTimeString()}</span></li>
        </ul>

        <div style="text-align: center;">
          <a href="#" class="button">View Session</a>
        </div>
      `,
        "New Session Alert",
        websiteName,
      ),
    },
    daily_summary: {
      subject: `Daily Snapshot: ${websiteName}`,
      html: renderEmailWrapper(
        `
        <div class="badge" style="background: #EEF2FF; color: #4338CA;">Daily Performance</div>
        <h2 style="margin-bottom: 8px;">Executive Summary</h2>
        <p style="margin-bottom: 24px;">Performance overview for <strong>${websiteName}</strong> on ${reportDateLabel}.</p>
        
        <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 20px; margin-bottom: 32px;">
          <h3 style="font-size: 13px; text-transform: uppercase; color: #64748B; letter-spacing: 0.05em; margin-bottom: 16px;">Traffic Highlights</h3>
          <div class="metric-grid" style="margin: 0; display: table; width: 100%;">
            <div style="display: table-cell; width: 50%; padding-right: 10px;">
              <div style="font-size: 11px; color: #94A3B8; font-weight: 600; text-transform: uppercase;">Total Page Views</div>
              <div style="font-size: 24px; font-weight: 800; color: #1E293B;">${formatNumber(eventData.pageViews)}</div>
            </div>
            <div style="display: table-cell; width: 50%;">
              <div style="font-size: 11px; color: #94A3B8; font-weight: 600; text-transform: uppercase;">Unique Visitors</div>
              <div style="font-size: 24px; font-weight: 800; color: #1E293B;">${formatNumber(eventData.uniqueVisitors)}</div>
            </div>
          </div>
        </div>

        <div style="display: table; width: 100%; margin-bottom: 32px;">
          <div style="display: table-cell; width: 33%; text-align: center; border-right: 1px solid #F1F5F9;">
            <div style="font-size: 10px; color: #94A3B8; font-weight: 600; text-transform: uppercase;">Bounce Rate</div>
            <div style="font-size: 16px; font-weight: 700; color: #334155; margin-top: 4px;">${formatPercentage(eventData.bounceRate)}</div>
          </div>
          <div style="display: table-cell; width: 33%; text-align: center; border-right: 1px solid #F1F5F9;">
            <div style="font-size: 10px; color: #94A3B8; font-weight: 600; text-transform: uppercase;">Engagement</div>
            <div style="font-size: 16px; font-weight: 700; color: #4F46E5; margin-top: 4px;">${formatPercentage(eventData.engagementRate)}</div>
          </div>
          <div style="display: table-cell; width: 34%; text-align: center;">
            <div style="font-size: 10px; color: #94A3B8; font-weight: 600; text-transform: uppercase;">JS Errors</div>
            <div style="font-size: 16px; font-weight: 700; color: ${eventData.jsErrors > 0 ? "#EF4444" : "#10B981"}; margin-top: 4px;">${formatNumber(eventData.jsErrors)}</div>
          </div>
        </div>

        <div style="margin-top: 40px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h3 style="font-size: 16px; margin: 0;">Popular Pages</h3>
          </div>
          <ul style="list-style: none; padding: 0; margin: 0;">
            ${renderBreakdownList(eventData.topPages, "No page data collected yet.")}
          </ul>
        </div>

        <div style="margin-top: 40px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h3 style="font-size: 16px; margin: 0;">Top Referrers</h3>
          </div>
          <ul style="list-style: none; padding: 0; margin: 0;">
            ${renderBreakdownList(eventData.topReferrers, "Direct traffic or no referrer data.")}
          </ul>
        </div>

        <div style="text-align: center; margin-top: 32px;">
          <a href="#" class="button">Deep Dive into Analytics</a>
        </div>
      `,
        "Daily Summary",
        websiteName,
      ),
    },
    error_threshold: {
      subject: `Error Threshold Exceeded on ${websiteName}`,
      html: renderEmailWrapper(
        `
        <div class="badge" style="background: #FEE2E2; color: #B91C1C;">Critical Alert</div>
        <h2 style="color: #DC2626;">High Error Rate Detected</h2>
        <p>Multiple errors were captured on <strong>${websiteName}</strong> in a short period.</p>
        
        <ul class="details-list" style="border-left: 4px solid #DC2626;">
          <li><span class="label">Error Count</span> <span class="value" style="color: #DC2626;">${eventData.errorCount || 0}</span></li>
          <li><span class="label">Threshold</span> <span class="value">${eventData.threshold || 10}</span></li>
          <li><span class="label">Most Common</span> <span class="value" style="font-size: 12px; max-width: 150px; text-align: right;">${eventData.topError || "N/A"}</span></li>
        </ul>

        <div style="text-align: center;">
          <a href="#" class="button" style="background: #DC2626;">Investigate Errors</a>
        </div>
      `,
        "Error Threshold Alert",
        websiteName,
      ),
    },
    uptime_status: {
      subject: `Uptime Alert: ${websiteName} is ${currentStatus === "down" ? "DOWN" : "UP"}`,
      html: renderEmailWrapper(
        `
        <div class="badge" style="background: ${isDowntimeAlert ? "#FEE2E2" : "#D1FAE5"}; color: ${isDowntimeAlert ? "#B91C1C" : "#065F46"};">Uptime Monitor</div>
        <h2 style="color: ${isDowntimeAlert ? "#DC2626" : "#10B981"};">
          ${isDowntimeAlert ? "Website Down" : "Service Restored"}
        </h2>
        <p><strong>${websiteName}</strong> is currently <strong>${currentStatus === "down" ? "UNAVAILABLE" : "ONLINE"}</strong>.</p>
        
        <ul class="details-list" style="border-left: 4px solid ${isDowntimeAlert ? "#DC2626" : "#10B981"};">
          <li><span class="label">Status</span> <span class="value" style="color: ${isDowntimeAlert ? "#DC2626" : "#10B981"};">${currentStatus.toUpperCase()}</span></li>
          ${eventData.statusCode ? `<li><span class="label">Status Code</span> <span class="value">${eventData.statusCode}</span></li>` : ""}
          ${eventData.responseTime ? `<li><span class="label">Response Time</span> <span class="value">${eventData.responseTime} ms</span></li>` : ""}
          ${eventData.durationMinutes !== undefined ? `<li><span class="label">Duration</span> <span class="value">${eventData.durationMinutes} min</span></li>` : ""}
          <li><span class="label">Detected At</span> <span class="value">${new Date().toLocaleString()}</span></li>
        </ul>

        ${
          eventData.errorMessage
            ? `
          <div style="background: #F9FAFB; padding: 12px; border-radius: 8px; border: 1px solid #F3F4F6; margin-top: 16px;">
            <div style="font-size: 12px; color: #6B7280; font-weight: 600; text-transform: uppercase;">Error Details</div>
            <div style="font-size: 14px; color: #DC2626; margin-top: 4px;">${eventData.errorMessage}</div>
          </div>
        `
            : ""
        }

        <div style="text-align: center;">
          <a href="#" class="button">Open Uptime Dashboard</a>
        </div>
      `,
        "Uptime Alert",
        websiteName,
      ),
    },
  };

  const template = templates[eventType] || {
    subject: `Notification from ${websiteName}`,
    html: renderEmailWrapper(
      `
        <div class="badge" style="background: #F3F4F6; color: #374151;">System Notification</div>
        <h2>Security or System Event</h2>
        <p>A new event has been recorded for <strong>${websiteName}</strong>.</p>
        
        <ul class="details-list">
          <li><span class="label">Event Type</span> <span class="value">${eventType}</span></li>
          <li><span class="label">Time</span> <span class="value">${new Date().toLocaleString()}</span></li>
        </ul>

        <div style="background: #F3F4F6; padding: 12px; border-radius: 8px; font-size: 13px; overflow-x: auto; margin-top: 16px;">
          <div style="font-weight: 600; margin-bottom: 4px; color: #6B7280; text-transform: uppercase; font-size: 11px;">Data Payload</div>
          <pre style="margin: 0;">${JSON.stringify(eventData, null, 2)}</pre>
        </div>
      `,
      "Notification",
      websiteName,
    ),
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
