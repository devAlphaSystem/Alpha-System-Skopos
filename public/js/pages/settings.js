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
  }

  const themeToggle = document.getElementById("theme-toggle");
  if (themeToggle) {
    themeToggle.addEventListener("change", (e) => {
      settings.theme = e.target.checked ? "dark" : "light";
      saveSettings();
      applySettingsToUI();
      window.dispatchEvent(new CustomEvent("themeChanged"));
    });
  }

  const refreshRateSelect = document.getElementById("refresh-rate-select");
  if (refreshRateSelect) {
    refreshRateSelect.addEventListener("change", (e) => {
      settings.refreshRate = Number.parseInt(e.target.value);
      saveSettings();
      window.dispatchEvent(new CustomEvent("settingsChanged"));
    });
  }

  const autoRefreshToggle = document.getElementById("auto-refresh-toggle");
  if (autoRefreshToggle) {
    autoRefreshToggle.addEventListener("change", (e) => {
      settings.autoRefresh = e.target.checked;
      saveSettings();
      window.dispatchEvent(new CustomEvent("settingsChanged"));
    });
  }

  const dataPeriodSelect = document.getElementById("data-period-select");
  if (dataPeriodSelect) {
    dataPeriodSelect.addEventListener("change", (e) => {
      settings.dataPeriod = Number.parseInt(e.target.value);
      saveSettings();
      window.dispatchEvent(new CustomEvent("settingsChanged"));
    });
  }

  const resultsLimitSelect = document.getElementById("results-limit-select");
  if (resultsLimitSelect) {
    resultsLimitSelect.addEventListener("change", (e) => {
      settings.resultsLimit = Number.parseInt(e.target.value);
      saveSettings();
      window.dispatchEvent(new CustomEvent("settingsChanged"));
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
      } catch (error) {
        console.error("Error updating IP storage setting:", error);
        e.target.checked = !isEnabled;
        window.customAlert("Error", "Failed to update IP storage setting. Please try again.");
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
    traffic_spike: "Traffic Spike",
  };

  tbody.innerHTML = rules
    .map((rule) => {
      const eventLabel = eventTypeLabels[rule.eventType] || rule.eventType;
      const eventDisplay = rule.eventType === "custom_event" && rule.customEventName ? `${eventLabel}: ${rule.customEventName}` : eventLabel;

      const websiteName = rule.expand?.website?.name || "All Websites";

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
          <button class="btn-icon" onclick="deleteNotificationRule('${rule.id}')" title="Delete rule">
            <i class="fa-solid fa-trash"></i>
          </button>
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

  if (eventType === "custom_event") {
    customEventNameGroup.style.display = "block";
    customEventNameInput.required = true;
  } else {
    customEventNameGroup.style.display = "none";
    customEventNameInput.required = false;
    customEventNameInput.value = "";
  }

  const eventTypeToRuleName = {
    new_visitor: "New Visitor Alert",
    new_session: "New Session Alert",
    daily_summary: "Daily Summary Report",
    error_threshold: "Error Threshold Alert",
    traffic_spike: "Traffic Spike Alert",
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
