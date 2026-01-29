const MANUAL_TRIGGER_EVENT_TYPES = new Set(["daily_summary"]);

document.addEventListener("DOMContentLoaded", () => {
  const tabs = document.querySelectorAll(".tab-button");
  const panels = document.querySelectorAll(".tab-panel");

  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      const targetPanel = tab.dataset.tab;

      for (const t of tabs) {
        t.classList.remove("active");
      }

      for (const panelEl of panels) {
        panelEl.classList.remove("active");
      }

      tab.classList.add("active");
      const panel = document.getElementById(`${targetPanel}-panel`);
      if (panel) {
        panel.classList.add("active");
      }
    });
  }

  const DEFAULT_SETTINGS = {
    theme: "light",
    refreshRate: 60000,
    autoRefresh: true,
    dataPeriod: 7,
    resultsLimit: 10,
    toastsEnabled: true,
    showUniqueVisitors: false,
    timezone: "UTC",
    overviewDataPeriod: 7,
    overviewResultsLimit: 10,
    overviewShowUniqueVisitors: false,
  };

  const settings = window.__SKOPOS_SETTINGS__ || { ...DEFAULT_SETTINGS };

  function saveSettings() {
    try {
      localStorage.setItem("skopos-settings", JSON.stringify(settings));
    } catch (e) {
      console.error("Failed to save settings:", e);
    }
  }

  function applySettingsToUI() {
    document.documentElement.setAttribute("data-theme", settings.theme);

    const themeToggle = document.getElementById("theme-toggle");
    if (themeToggle) {
      themeToggle.checked = settings.theme === "dark";
    }

    const refreshRateSelect = document.getElementById("refresh-rate-select");
    if (refreshRateSelect) {
      refreshRateSelect.value = settings.refreshRate;
    }

    const autoRefreshToggle = document.getElementById("auto-refresh-toggle");
    if (autoRefreshToggle) {
      autoRefreshToggle.checked = settings.autoRefresh;
    }

    const dataPeriodSelect = document.getElementById("data-period-select");
    if (dataPeriodSelect) {
      dataPeriodSelect.value = settings.dataPeriod;
    }

    const resultsLimitSelect = document.getElementById("results-limit-select");
    if (resultsLimitSelect) {
      resultsLimitSelect.value = settings.resultsLimit;
    }

    const toastsToggle = document.getElementById("toasts-toggle");
    if (toastsToggle) {
      toastsToggle.checked = settings.toastsEnabled !== false;
    }

    const uniqueVisitorsToggle = document.getElementById("unique-visitors-toggle");
    if (uniqueVisitorsToggle) {
      uniqueVisitorsToggle.checked = settings.showUniqueVisitors === true;
    }

    const timezoneSelect = document.getElementById("timezone-select");
    if (timezoneSelect) {
      const serverTimezone = timezoneSelect.dataset.serverTimezone;
      if (serverTimezone && serverTimezone !== "UTC" && serverTimezone !== settings.timezone) {
        settings.timezone = serverTimezone;
        saveSettings();
        window.__SKOPOS_SETTINGS__ = settings;
        window.dispatchEvent(new CustomEvent("timezoneChanged", { detail: { timezone: serverTimezone } }));
      }
      timezoneSelect.value = settings.timezone || "UTC";
    }

    const overviewDataPeriodSelect = document.getElementById("overview-data-period-select");
    if (overviewDataPeriodSelect) {
      overviewDataPeriodSelect.value = settings.overviewDataPeriod || 7;
    }

    const overviewResultsLimitSelect = document.getElementById("overview-results-limit-select");
    if (overviewResultsLimitSelect) {
      overviewResultsLimitSelect.value = settings.overviewResultsLimit || 10;
    }

    const overviewUniqueVisitorsToggle = document.getElementById("overview-unique-visitors-toggle");
    if (overviewUniqueVisitorsToggle) {
      overviewUniqueVisitorsToggle.checked = settings.overviewShowUniqueVisitors === true;
    }
  }

  const themeToggle = document.getElementById("theme-toggle");
  if (themeToggle) {
    themeToggle.addEventListener("change", (e) => {
      settings.theme = e.target.checked ? "dark" : "light";
      saveSettings();
      applySettingsToUI();
      window.dispatchEvent(new CustomEvent("themeChanged"));
      showToast("Theme Updated", `${settings.theme === "dark" ? "Dark" : "Light"} mode enabled`, "success");
    });
  }

  const toastsToggle = document.getElementById("toasts-toggle");
  if (toastsToggle) {
    toastsToggle.addEventListener("change", (e) => {
      settings.toastsEnabled = e.target.checked;
      saveSettings();
      if (settings.toastsEnabled) {
        showToast("Toast Notifications", "Toast notifications enabled", "success");
      }
    });
  }

  const uniqueVisitorsToggle = document.getElementById("unique-visitors-toggle");
  if (uniqueVisitorsToggle) {
    uniqueVisitorsToggle.addEventListener("change", (e) => {
      settings.showUniqueVisitors = e.target.checked;
      saveSettings();
      window.dispatchEvent(new CustomEvent("settingsChanged"));
      showToast("Visitors Display Updated", `Showing ${settings.showUniqueVisitors ? "unique" : "all"} visitors`, "success");
    });
  }

  const timezoneSelect = document.getElementById("timezone-select");
  if (timezoneSelect) {
    timezoneSelect.addEventListener("change", async (e) => {
      const newTimezone = e.target.value;
      settings.timezone = newTimezone;
      saveSettings();

      window.__SKOPOS_SETTINGS__ = { ...window.__SKOPOS_SETTINGS__, timezone: newTimezone };

      try {
        const response = await fetch("/settings/app", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ timezone: newTimezone }),
        });

        if (!response.ok) {
          throw new Error("Failed to update timezone");
        }

        window.dispatchEvent(new CustomEvent("timezoneChanged", { detail: { timezone: newTimezone } }));
        showToast("Timezone Updated", `Timezone set to ${newTimezone}`, "success");
      } catch (error) {
        console.error("Error updating timezone:", error);
        window.customAlert("Error", "Failed to update timezone setting. Please try again.");
      }
    });
  }

  const refreshRateSelect = document.getElementById("refresh-rate-select");
  if (refreshRateSelect) {
    refreshRateSelect.addEventListener("change", (e) => {
      settings.refreshRate = Number.parseInt(e.target.value);
      saveSettings();
      window.dispatchEvent(new CustomEvent("settingsChanged"));
      const rate = settings.refreshRate === 0 ? "Instant" : settings.refreshRate >= 60000 ? `${settings.refreshRate / 60000} minute${settings.refreshRate / 60000 > 1 ? "s" : ""}` : `${settings.refreshRate / 1000} seconds`;
      showToast("Refresh Rate Updated", `Refresh interval set to ${rate}`, "success");
    });
  }

  const autoRefreshToggle = document.getElementById("auto-refresh-toggle");
  if (autoRefreshToggle) {
    autoRefreshToggle.addEventListener("change", (e) => {
      settings.autoRefresh = e.target.checked;
      saveSettings();
      window.dispatchEvent(new CustomEvent("settingsChanged"));
      showToast("Auto Refresh Updated", `Auto refresh ${settings.autoRefresh ? "enabled" : "disabled"}`, "success");
    });
  }

  const dataPeriodSelect = document.getElementById("data-period-select");
  if (dataPeriodSelect) {
    dataPeriodSelect.addEventListener("change", (e) => {
      settings.dataPeriod = Number.parseInt(e.target.value);
      saveSettings();

      const periodText = settings.dataPeriod === 1 ? "today" : `${settings.dataPeriod} days`;
      const currentPath = window.location.pathname;
      if (currentPath.includes("/dashboard") || currentPath === "/") {
        showToast("Data Period Updated", `Data period set to ${periodText}. Reloading...`, "info");
        const url = new URL(window.location.href);
        url.searchParams.set("period", settings.dataPeriod);
        setTimeout(() => {
          window.location.href = url.toString();
        }, 1000);
      } else {
        window.dispatchEvent(new CustomEvent("settingsChanged"));
        showToast("Data Period Updated", `Data period set to ${periodText}`, "success");
      }
    });
  }

  const resultsLimitSelect = document.getElementById("results-limit-select");
  if (resultsLimitSelect) {
    resultsLimitSelect.addEventListener("change", (e) => {
      settings.resultsLimit = Number.parseInt(e.target.value);
      saveSettings();
      window.dispatchEvent(new CustomEvent("settingsChanged"));
      showToast("Results Limit Updated", `Results per card set to ${settings.resultsLimit}`, "success");
    });
  }

  const overviewDataPeriodSelect = document.getElementById("overview-data-period-select");
  if (overviewDataPeriodSelect) {
    overviewDataPeriodSelect.addEventListener("change", (e) => {
      settings.overviewDataPeriod = Number.parseInt(e.target.value);
      saveSettings();
      window.__SKOPOS_SETTINGS__ = settings;

      const periodText = settings.overviewDataPeriod === 1 ? "today" : `${settings.overviewDataPeriod} days`;
      const currentPath = window.location.pathname;
      if (currentPath === "/" || currentPath === "/overview") {
        showToast("Overview Data Period Updated", `Data period set to ${periodText}. Reloading...`, "info");
        const url = new URL(window.location.href);
        url.searchParams.set("period", settings.overviewDataPeriod);
        url.searchParams.set("limit", settings.overviewResultsLimit || 10);
        setTimeout(() => {
          window.location.href = url.toString();
        }, 1000);
      } else {
        window.dispatchEvent(new CustomEvent("settingsChanged"));
        showToast("Overview Data Period Updated", `Data period set to ${periodText}`, "success");
      }
    });
  }

  const overviewResultsLimitSelect = document.getElementById("overview-results-limit-select");
  if (overviewResultsLimitSelect) {
    overviewResultsLimitSelect.addEventListener("change", (e) => {
      settings.overviewResultsLimit = Number.parseInt(e.target.value);
      saveSettings();
      window.__SKOPOS_SETTINGS__ = settings;
      window.dispatchEvent(new CustomEvent("settingsChanged"));
      showToast("Overview Results Limit Updated", `Results per card set to ${settings.overviewResultsLimit}`, "success");
    });
  }

  const overviewUniqueVisitorsToggle = document.getElementById("overview-unique-visitors-toggle");
  if (overviewUniqueVisitorsToggle) {
    overviewUniqueVisitorsToggle.addEventListener("change", (e) => {
      settings.overviewShowUniqueVisitors = e.target.checked;
      saveSettings();
      window.__SKOPOS_SETTINGS__ = settings;
      window.dispatchEvent(new CustomEvent("settingsChanged"));
      showToast("Overview Visitors Display Updated", `Showing ${settings.overviewShowUniqueVisitors ? "unique" : "all"} visitors in overview`, "success");
    });
  }

  const storeRawIpToggle = document.getElementById("store-raw-ip-toggle");
  if (storeRawIpToggle) {
    storeRawIpToggle.addEventListener("change", async (e) => {
      const isEnabled = e.target.checked;

      try {
        const response = await fetch("/settings/app", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ storeRawIp: isEnabled }),
        });

        if (!response.ok) {
          throw new Error("Failed to update setting");
        }
        showToast("IP Storage Updated", `Raw IP storage ${isEnabled ? "enabled" : "disabled"}`, "success");
      } catch (error) {
        console.error("Error updating IP storage setting:", error);
        e.target.checked = !isEnabled;
        window.customAlert("Error", "Failed to update IP storage setting. Please try again.");
      }
    });
  }

  const discardShortSessionsToggle = document.getElementById("discard-short-sessions-toggle");
  if (discardShortSessionsToggle) {
    discardShortSessionsToggle.addEventListener("change", async (e) => {
      const isEnabled = e.target.checked;

      try {
        const response = await fetch("/settings/app", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ discardShortSessions: isEnabled }),
        });

        if (!response.ok) {
          throw new Error("Failed to update setting");
        }
        showToast("Short Session Filtering Updated", `Sessions under 1 second will ${isEnabled ? "be discarded" : "be stored"}`, "success");
      } catch (error) {
        console.error("Error updating short session filtering setting:", error);
        e.target.checked = !isEnabled;
        window.customAlert("Error", "Failed to update short session filtering setting. Please try again.");
      }
    });
  }

  applySettingsToUI();

  loadNotificationRules();

  const notificationDrawerOverlay = document.getElementById("notification-drawer-overlay");
  const notificationDrawerClose = document.getElementById("notification-drawer-close");

  if (notificationDrawerOverlay) {
    notificationDrawerOverlay.addEventListener("click", () => {
      window.closeNotificationModal();
    });
  }

  if (notificationDrawerClose) {
    notificationDrawerClose.addEventListener("click", () => {
      window.closeNotificationModal();
    });
  }
});

window.addApiKey = async (event, service) => {
  event.preventDefault();
  const form = event.target;
  const apiKeyInput = form.querySelector('[name="apiKey"]');
  const apiKey = apiKeyInput ? apiKeyInput.value.trim() : "";

  if (!apiKey) {
    await window.customAlert("Missing API Key", "Please enter an API key.");
    return;
  }

  const payload = { service, apiKey };

  if (service === "resend") {
    const fromEmailInput = form.querySelector('[name="fromEmail"]');
    const fromEmail = fromEmailInput ? fromEmailInput.value.trim() : "";

    if (!fromEmail) {
      await window.customAlert("Missing From Email", "Please enter a from email address.");
      return;
    }

    payload.metadata = { fromEmail };
  }

  const submitBtn = form.querySelector('button[type="submit"]');
  if (!submitBtn) {
    return;
  }

  const originalText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

  try {
    const response = await fetch("/settings/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (response.ok) {
      window.location.reload();
      return;
    }

    await window.customAlert("Save Failed", data.error || "Failed to save API key.");
  } catch (error) {
    console.error("Error saving API key:", error);
    await window.customAlert("Network Error", "Error saving API key. Please try again.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
};

window.deleteApiKey = async (keyId, serviceName) => {
  const serviceLabel = serviceName.replace(/_/g, " ");
  const confirmed = await window.customConfirm("Remove API Key?", `Are you sure you want to remove your ${serviceLabel} API key? This action cannot be undone.`);

  if (!confirmed) {
    return;
  }

  try {
    const response = await fetch(`/settings/api-keys/${keyId}`, {
      method: "DELETE",
    });

    const data = await response.json();

    if (response.ok) {
      window.location.reload();
      return;
    }

    await window.customAlert("Delete Failed", data.error || "Failed to delete API key.");
  } catch (error) {
    console.error("Error deleting API key:", error);
    await window.customAlert("Network Error", "Error deleting API key. Please try again.");
  }
};

async function loadNotificationRules() {
  try {
    const response = await fetch("/settings/notifications");
    const data = await response.json();

    if (response.ok && data.rules) {
      renderNotificationRules(data.rules);
    }
  } catch (error) {
    console.error("Error loading notification rules:", error);
  }
}

function renderNotificationRules(rules) {
  const tbody = document.getElementById("notifications-table-body");
  if (!tbody) return;

  if (rules.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="padding: 2rem; text-align: center; color: var(--text-muted);">
          <i class="fa-solid fa-bell-slash" style="font-size: 2rem; opacity: 0.3; display: block; margin-bottom: 0.5rem;"></i>
          No notification rules configured yet.
        </td>
      </tr>
    `;
    return;
  }

  const eventTypeLabels = {
    new_visitor: "New Visitor",
    custom_event: "Custom Event",
    new_session: "New Session",
    daily_summary: "Daily Summary",
    error_threshold: "Error Threshold",
    uptime_status: "Uptime Status",
  };
  const uptimeNotifyLabels = {
    down: "Downtime Alerts",
    up: "Recovery Alerts",
    both: "Downtime & Recovery Alerts",
  };

  tbody.innerHTML = rules
    .map((rule) => {
      const eventLabel = eventTypeLabels[rule.eventType] || rule.eventType;
      const eventDisplay = (() => {
        if (rule.eventType === "custom_event" && rule.customEventName) {
          return `${eventLabel}: ${rule.customEventName}`;
        }

        if (rule.eventType === "uptime_status") {
          const notifyOn = rule.metadata?.notifyOn || "down";
          const suffix = uptimeNotifyLabels[notifyOn] ? ` · ${uptimeNotifyLabels[notifyOn]}` : "";
          return `${eventLabel}${suffix}`;
        }

        return eventLabel;
      })();

      const websiteName = rule.expand?.website?.name || "All Websites";

      const manualTriggerSupported = MANUAL_TRIGGER_EVENT_TYPES.has(rule.eventType);
      const manualTriggerButton = manualTriggerSupported
        ? `<button class="btn-icon" data-trigger-btn="${rule.id}" onclick="manualTriggerNotificationRule('${rule.id}')" title="Send this notification now">
            <i class="fa-solid fa-paper-plane"></i>
          </button>`
        : `<button class="btn-icon" disabled title="Manual trigger not available for this event type" style="opacity: 0.5; cursor: not-allowed;">
            <i class="fa-solid fa-paper-plane"></i>
          </button>`;

      return `
      <tr>
        <td style="font-weight: 500; color: var(--text-primary);">${rule.name}</td>
        <td><span style="font-size: 0.875rem;">${eventDisplay}</span></td>
        <td><span style="font-size: 0.875rem;">${rule.recipientEmail}</span></td>
        <td><span style="font-size: 0.875rem;">${websiteName}</span></td>
        <td style="text-align: center;">
          <label class="toggle-switch" style="display: inline-block;">
            <input type="checkbox" ${rule.isActive ? "checked" : ""} onchange="toggleNotificationRule('${rule.id}', this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </td>
        <td style="text-align: center;">
          <span style="font-size: 0.875rem; color: var(--text-muted);">${rule.triggerCount || 0}x</span>
        </td>
        <td style="text-align: center;">
          <div style="display: flex; align-items: center; justify-content: center; gap: 0.35rem;">
            ${manualTriggerButton}
            <button class="btn-icon" onclick="deleteNotificationRule('${rule.id}')" title="Delete rule">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
    })
    .join("");
}

window.showAddNotificationModal = () => {
  const overlay = document.getElementById("notification-drawer-overlay");
  const drawer = document.getElementById("notification-drawer");

  if (overlay && drawer) {
    overlay.classList.add("active");
    drawer.classList.add("active");
    document.getElementById("notification-form").reset();
    document.getElementById("custom-event-name-group").style.display = "none";
    const uptimeSettings = document.getElementById("uptime-event-settings");
    if (uptimeSettings) {
      uptimeSettings.style.display = "none";
    }
    const uptimeSelect = document.getElementById("uptime-notify-on");
    if (uptimeSelect) {
      uptimeSelect.value = "down";
    }

    const lastEmail = localStorage.getItem("skopos-notification-email");
    if (lastEmail) {
      const emailInput = document.querySelector('[name="recipientEmail"]');
      if (emailInput) {
        emailInput.value = lastEmail;
      }
    }
  }
};

window.closeNotificationModal = () => {
  const overlay = document.getElementById("notification-drawer-overlay");
  const drawer = document.getElementById("notification-drawer");

  if (overlay && drawer) {
    overlay.classList.remove("active");
    drawer.classList.remove("active");
  }
};

window.closeNotificationDrawer = () => {
  window.closeNotificationModal();
};

window.handleEventTypeChange = (eventType) => {
  const customEventNameGroup = document.getElementById("custom-event-name-group");
  const customEventNameInput = document.querySelector('[name="customEventName"]');
  const ruleNameInput = document.querySelector('[name="name"]');
  const uptimeSettings = document.getElementById("uptime-event-settings");

  if (eventType === "custom_event") {
    customEventNameGroup.style.display = "block";
    customEventNameInput.required = true;
  } else {
    customEventNameGroup.style.display = "none";
    customEventNameInput.required = false;
    customEventNameInput.value = "";
  }

  if (uptimeSettings) {
    uptimeSettings.style.display = eventType === "uptime_status" ? "block" : "none";
  }

  const eventTypeToRuleName = {
    new_visitor: "New Visitor Alert",
    new_session: "New Session Alert",
    daily_summary: "Daily Summary Report",
    error_threshold: "Error Threshold Alert",
    uptime_status: "Website Uptime Alert",
  };

  if (eventType && eventType !== "custom_event" && ruleNameInput && eventTypeToRuleName[eventType]) {
    ruleNameInput.value = eventTypeToRuleName[eventType];
  }
};

window.saveNotificationRule = async (event) => {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);

  const ruleData = {
    name: formData.get("name"),
    eventType: formData.get("eventType"),
    recipientEmail: formData.get("recipientEmail"),
    website: formData.get("website") || "",
    customEventName: formData.get("customEventName") || "",
  };

  if (ruleData.eventType === "uptime_status") {
    ruleData.metadata = {
      notifyOn: formData.get("uptimeNotifyOn") || "down",
    };
  }

  if (ruleData.recipientEmail) {
    localStorage.setItem("skopos-notification-email", ruleData.recipientEmail);
  }

  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

  try {
    const response = await fetch("/settings/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ruleData),
    });

    const data = await response.json();

    if (response.ok) {
      window.closeNotificationModal();
      await loadNotificationRules();
      return;
    }

    await window.customAlert("Save Failed", data.error || "Failed to create notification rule.");
  } catch (error) {
    console.error("Error saving notification rule:", error);
    await window.customAlert("Network Error", "Error saving notification rule. Please try again.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
};

window.toggleNotificationRule = async (ruleId, isActive) => {
  try {
    const response = await fetch(`/settings/notifications/${ruleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });

    const data = await response.json();

    if (!response.ok) {
      await window.customAlert("Update Failed", data.error || "Failed to update notification rule.");
      await loadNotificationRules();
    }
  } catch (error) {
    console.error("Error toggling notification rule:", error);
    await window.customAlert("Network Error", "Error updating notification rule. Please try again.");
    await loadNotificationRules();
  }
};

window.deleteNotificationRule = async (ruleId) => {
  const confirmed = await window.customConfirm("Delete Notification Rule?", "Are you sure you want to delete this notification rule? This action cannot be undone.");

  if (!confirmed) {
    return;
  }

  try {
    const response = await fetch(`/settings/notifications/${ruleId}`, {
      method: "DELETE",
    });

    const data = await response.json();

    if (response.ok) {
      await loadNotificationRules();
      return;
    }

    await window.customAlert("Delete Failed", data.error || "Failed to delete notification rule.");
  } catch (error) {
    console.error("Error deleting notification rule:", error);
    await window.customAlert("Network Error", "Error deleting notification rule. Please try again.");
  }
};

window.manualTriggerNotificationRule = async (ruleId) => {
  const confirmed = await window.customConfirm("Send Notification Now?", "This will immediately send the notification email for this rule. Continue?");

  if (!confirmed) {
    return;
  }

  const triggerBtn = document.querySelector(`[data-trigger-btn="${ruleId}"]`);
  const originalContent = triggerBtn ? triggerBtn.innerHTML : null;

  if (triggerBtn) {
    triggerBtn.disabled = true;
    triggerBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  }

  try {
    const response = await fetch(`/settings/notifications/${ruleId}/send`, {
      method: "POST",
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to trigger notification.");
    }

    if (typeof showToast === "function") {
      showToast("Notification Sent", data.message || "Notification triggered successfully.", "success");
    }
  } catch (error) {
    console.error("Error triggering notification rule:", error);
    await window.customAlert("Trigger Failed", error.message || "Failed to trigger notification. Please try again.");
  } finally {
    if (triggerBtn && originalContent) {
      triggerBtn.disabled = false;
      triggerBtn.innerHTML = originalContent;
    }
  }
};

window.testPageSpeedConnection = () => {
  const overlay = document.getElementById("test-modal-overlay");
  const modal = document.getElementById("pagespeed-test-modal");
  if (overlay && modal) {
    overlay.classList.add("active");
    modal.classList.add("active");
    document.getElementById("pagespeed-test-form").reset();
    document.getElementById("pagespeed-test-result").style.display = "none";
  }
};

window.testChapybaraConnection = () => {
  const overlay = document.getElementById("test-modal-overlay");
  const modal = document.getElementById("chapybara-test-modal");
  if (overlay && modal) {
    overlay.classList.add("active");
    modal.classList.add("active");
    document.getElementById("chapybara-test-form").reset();
    document.getElementById("chapybara-test-result").style.display = "none";
  }
};

window.testResendConnection = () => {
  const overlay = document.getElementById("test-modal-overlay");
  const modal = document.getElementById("resend-test-modal");
  if (overlay && modal) {
    overlay.classList.add("active");
    modal.classList.add("active");
    document.getElementById("resend-test-form").reset();
    document.getElementById("resend-test-result").style.display = "none";

    const savedEmail = localStorage.getItem("skopos-notification-email");
    if (savedEmail) {
      const recipientInput = document.getElementById("resend-recipient");
      if (recipientInput) {
        recipientInput.value = savedEmail;
      }
    }
  }
};

window.closeTestModal = () => {
  const overlay = document.getElementById("test-modal-overlay");
  const modals = document.querySelectorAll(".modal-dialog");

  if (overlay) {
    overlay.classList.remove("active");
  }

  for (const modal of modals) {
    modal.classList.remove("active");
  }
};

window.handleUseCurrentUrl = (checked) => {
  const urlInput = document.getElementById("pagespeed-url");
  if (checked && urlInput) {
    urlInput.value = window.location.origin;
  }
};

window.handleUseCurrentIp = async (checked) => {
  const ipInput = document.getElementById("chapybara-ip");
  if (checked && ipInput) {
    try {
      const response = await fetch("https://api.ipify.org?format=json");
      const data = await response.json();
      ipInput.value = data.ip;
    } catch (error) {
      console.error("Error fetching current IP:", error);
      await window.customAlert("Error", "Failed to fetch your current IP address.");
    }
  }
};

window.handleUseNotificationEmail = (checked, email) => {
  const recipientInput = document.getElementById("resend-recipient");
  if (checked && recipientInput) {
    recipientInput.value = email;
  }
};

window.submitPageSpeedTest = async (event) => {
  event.preventDefault();
  const form = event.target;
  const url = document.getElementById("pagespeed-url").value;
  const resultDiv = document.getElementById("pagespeed-test-result");
  const submitBtn = form.querySelector('button[type="submit"]');

  const originalText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Testing...';

  resultDiv.style.display = "none";

  try {
    const response = await fetch("/settings/test-api/pagespeed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      throw new Error("Received non-JSON response from server");
    }

    const data = await response.json();

    if (response.ok && data.success) {
      resultDiv.className = "test-result-success";
      resultDiv.innerHTML = `
        <div style="display: flex; align-items: start; gap: 0.75rem;">
          <i class="fa-solid fa-circle-check" style="font-size: 1.25rem;"></i>
          <div>
            <strong style="display: block; margin-bottom: 0.25rem;">Connection Successful!</strong>
            <div style="font-size: 0.875rem;">
              Performance Score: <strong>${data.data?.performanceScore || "N/A"}</strong><br>
              ${data.data?.url ? `Tested URL: ${data.data.url}` : ""}
            </div>
          </div>
        </div>
      `;
    } else {
      resultDiv.className = "test-result-error";
      resultDiv.innerHTML = `
        <div style="display: flex; align-items: start; gap: 0.75rem;">
          <i class="fa-solid fa-circle-xmark" style="font-size: 1.25rem;"></i>
          <div>
            <strong style="display: block; margin-bottom: 0.25rem;">Connection Failed</strong>
            <div style="font-size: 0.875rem;">${data.error || "Unknown error occurred"}</div>
          </div>
        </div>
      `;
    }

    resultDiv.style.display = "block";
  } catch (error) {
    console.error("Error testing PageSpeed API:", error);
    resultDiv.className = "test-result-error";
    resultDiv.innerHTML = `
      <div style="display: flex; align-items: start; gap: 0.75rem;">
        <i class="fa-solid fa-circle-xmark" style="font-size: 1.25rem;"></i>
        <div>
          <strong style="display: block; margin-bottom: 0.25rem;">Network Error</strong>
          <div style="font-size: 0.875rem;">Failed to connect to server. Please try again.</div>
        </div>
      </div>
    `;
    resultDiv.style.display = "block";
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
};

window.submitChapybaraTest = async (event) => {
  event.preventDefault();
  const form = event.target;
  const ip = document.getElementById("chapybara-ip").value;
  const resultDiv = document.getElementById("chapybara-test-result");
  const submitBtn = form.querySelector('button[type="submit"]');

  const originalText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Testing...';

  resultDiv.style.display = "none";

  try {
    const response = await fetch("/settings/test-api/chapybara", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      throw new Error("Received non-JSON response from server");
    }

    const data = await response.json();

    if (response.ok && data.success) {
      resultDiv.className = "test-result-success";
      resultDiv.innerHTML = `
        <div style="display: flex; align-items: start; gap: 0.75rem;">
          <i class="fa-solid fa-circle-check" style="font-size: 1.25rem;"></i>
          <div>
            <strong style="display: block; margin-bottom: 0.25rem;">Connection Successful!</strong>
            <div style="font-size: 0.875rem;">
              ${data.data?.country ? `Country: <strong>${data.data.country}</strong><br>` : ""}
              ${data.data?.city ? `City: ${data.data.city}<br>` : ""}
              ${data.data?.isp ? `ISP: ${data.data.isp}` : ""}
            </div>
          </div>
        </div>
      `;
    } else {
      resultDiv.className = "test-result-error";
      resultDiv.innerHTML = `
        <div style="display: flex; align-items: start; gap: 0.75rem;">
          <i class="fa-solid fa-circle-xmark" style="font-size: 1.25rem;"></i>
          <div>
            <strong style="display: block; margin-bottom: 0.25rem;">Connection Failed</strong>
            <div style="font-size: 0.875rem;">${data.error || "Unknown error occurred"}</div>
          </div>
        </div>
      `;
    }

    resultDiv.style.display = "block";
  } catch (error) {
    console.error("Error testing Chapybara API:", error);
    resultDiv.className = "test-result-error";
    resultDiv.innerHTML = `
      <div style="display: flex; align-items: start; gap: 0.75rem;">
        <i class="fa-solid fa-circle-xmark" style="font-size: 1.25rem;"></i>
        <div>
          <strong style="display: block; margin-bottom: 0.25rem;">Network Error</strong>
          <div style="font-size: 0.875rem;">Failed to connect to server. Please try again.</div>
        </div>
      </div>
    `;
    resultDiv.style.display = "block";
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
};

window.submitResendTest = async (event) => {
  event.preventDefault();
  const form = event.target;
  const recipient = document.getElementById("resend-recipient").value;
  const subject = document.getElementById("resend-subject").value;
  const body = document.getElementById("resend-body").value;
  const resultDiv = document.getElementById("resend-test-result");
  const submitBtn = form.querySelector('button[type="submit"]');

  const originalText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';

  resultDiv.style.display = "none";

  try {
    const response = await fetch("/settings/test-api/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient, subject, body }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      throw new Error("Received non-JSON response from server");
    }

    const data = await response.json();

    if (response.ok && data.success) {
      resultDiv.className = "test-result-success";
      resultDiv.innerHTML = `
        <div style="display: flex; align-items: start; gap: 0.75rem;">
          <i class="fa-solid fa-circle-check" style="font-size: 1.25rem;"></i>
          <div>
            <strong style="display: block; margin-bottom: 0.25rem;">Email Sent Successfully!</strong>
            <div style="font-size: 0.875rem;">
              ${data.data?.id ? `Email ID: ${data.data.id}<br>` : ""}
              Check your inbox at <strong>${recipient}</strong>
            </div>
          </div>
        </div>
      `;
    } else {
      resultDiv.className = "test-result-error";
      resultDiv.innerHTML = `
        <div style="display: flex; align-items: start; gap: 0.75rem;">
          <i class="fa-solid fa-circle-xmark" style="font-size: 1.25rem;"></i>
          <div>
            <strong style="display: block; margin-bottom: 0.25rem;">Email Send Failed</strong>
            <div style="font-size: 0.875rem;">${data.error || "Unknown error occurred"}</div>
          </div>
        </div>
      `;
    }

    resultDiv.style.display = "block";
  } catch (error) {
    console.error("Error testing Resend API:", error);
    resultDiv.className = "test-result-error";
    resultDiv.innerHTML = `
      <div style="display: flex; align-items: start; gap: 0.75rem;">
        <i class="fa-solid fa-circle-xmark" style="font-size: 1.25rem;"></i>
        <div>
          <strong style="display: block; margin-bottom: 0.25rem;">Network Error</strong>
          <div style="font-size: 0.875rem;">Failed to connect to server. Please try again.</div>
        </div>
      </div>
    `;
    resultDiv.style.display = "block";
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
};

document.addEventListener("DOMContentLoaded", () => {
  const overlay = document.getElementById("test-modal-overlay");
  if (overlay) {
    overlay.addEventListener("click", () => {
      window.closeTestModal();
    });
  }
});
