window.showLoadingModal = (title = "Processing...", message = "Please wait") => {
  const overlay = document.getElementById("loading-modal-overlay");
  const titleEl = document.getElementById("loading-modal-title");
  const messageEl = document.getElementById("loading-modal-message");
  if (overlay && titleEl && messageEl) {
    titleEl.textContent = title;
    messageEl.textContent = message;
    overlay.classList.add("active");
  }
};

window.hideLoadingModal = () => {
  const overlay = document.getElementById("loading-modal-overlay");
  if (overlay) {
    overlay.classList.remove("active");
  }
};

document.addEventListener("DOMContentLoaded", () => {
  const sidebarToggle = document.getElementById("sidebar-toggle");
  const mobileSidebarToggle = document.getElementById("mobile-sidebar-toggle");
  const sidebar = document.getElementById("sidebar");
  const websiteSelector = document.getElementById("website-selector");

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

  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener("click", () => {
      sidebar.classList.toggle("open");
    });
  }

  if (mobileSidebarToggle && sidebar) {
    mobileSidebarToggle.addEventListener("click", () => {
      sidebar.classList.toggle("open");
    });
  }

  if (sidebar) {
    document.addEventListener("click", (e) => {
      if (window.innerWidth <= 992 && sidebar.classList.contains("open")) {
        if (!sidebar.contains(e.target) && e.target !== sidebarToggle && e.target !== mobileSidebarToggle && !e.target.closest(".sidebar-toggle")) {
          sidebar.classList.remove("open");
        }
      }
    });
  }

  if (websiteSelector) {
    websiteSelector.addEventListener("change", (e) => {
      const selectedWebsiteId = e.target.value;
      if (selectedWebsiteId) {
        window.location.href = `/dashboard/${selectedWebsiteId}`;
      }
    });
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

  const modalOverlay = document.getElementById("custom-modal-overlay");
  const modalTitle = document.getElementById("custom-modal-title");
  const modalBody = document.getElementById("custom-modal-body");
  const modalActions = document.getElementById("custom-modal-actions");

  let resolvePromise;

  const showModal = (title, body, buttons) => {
    modalTitle.textContent = title;
    modalBody.innerHTML = body;
    modalActions.innerHTML = "";

    for (const button of buttons) {
      const btn = document.createElement("button");
      btn.textContent = button.text;
      btn.className = button.class;
      btn.addEventListener("click", () => {
        const res = resolvePromise;
        closeModal();
        if (res) {
          res(button.value);
        }
      });
      modalActions.appendChild(btn);
    }

    modalOverlay.classList.add("active");
    return new Promise((resolve) => {
      resolvePromise = resolve;
    });
  };

  const closeModal = () => {
    modalOverlay.classList.remove("active");
    resolvePromise = null;
  };

  if (modalOverlay) {
    modalOverlay.addEventListener("click", (e) => {
      if (e.target === modalOverlay) {
        closeModal();
        if (resolvePromise) {
          resolvePromise(false);
        }
      }
    });
  }

  window.customConfirm = (title, body) => {
    const buttons = [
      { text: "Cancel", class: "btn btn-secondary", value: false },
      { text: "Confirm", class: "btn", value: true },
    ];
    return showModal(title, body, buttons);
  };

  window.customAction = (title, body, primaryText = "Yes", secondaryText = "No") => {
    const buttons = [
      { text: secondaryText, class: "btn btn-secondary", value: false },
      { text: primaryText, class: "btn", value: true },
    ];
    return showModal(title, body, buttons);
  };

  window.customAlert = (title, body) => {
    const buttons = [{ text: "OK", class: "btn", value: true }];
    return showModal(title, body, buttons);
  };

  document.body.addEventListener("click", (e) => {
    const ipElement = e.target.closest(".ip-address-copyable");
    if (ipElement) {
      e.stopPropagation();
      const ip = ipElement.dataset.ip;

      navigator.clipboard
        .writeText(ip)
        .then(() => {
          const tooltip = document.createElement("div");
          tooltip.className = "ip-copy-tooltip";
          tooltip.textContent = "IP copied!";
          tooltip.style.left = `${e.clientX}px`;
          tooltip.style.top = `${e.clientY - 40}px`;
          document.body.appendChild(tooltip);

          setTimeout(() => tooltip.remove(), 900);
        })
        .catch((err) => {
          console.error("Failed to copy IP:", err);
        });
    }
  });

  document.body.addEventListener("click", async (e) => {
    const archiveButton = e.target.closest(".archive-website-btn");
    const deleteButton = e.target.closest(".delete-website-btn");
    const restoreButton = e.target.closest(".restore-website-btn");

    if (archiveButton && !archiveButton.dataset.confirmed) {
      e.preventDefault();
      const form = archiveButton.closest("form");
      if (!form) return;
      const websiteName = archiveButton.dataset.websiteName;
      const confirmed = await window.customConfirm("Archive Website?", `Are you sure you want to archive <strong>${websiteName}</strong>? Tracking will be disabled.`);
      if (confirmed) {
        window.showLoadingModal("Archiving Website", `Archiving ${websiteName}...`);
        archiveButton.dataset.confirmed = "true";
        archiveButton.click();
      }
    } else if (archiveButton?.dataset.confirmed) {
      delete archiveButton.dataset.confirmed;
    }

    if (restoreButton && !restoreButton.dataset.confirmed) {
      e.preventDefault();
      const form = restoreButton.closest("form");
      if (!form) return;
      const websiteName = restoreButton.dataset.websiteName;
      const confirmed = await window.customConfirm("Restore Website?", `Are you sure you want to restore <strong>${websiteName}</strong>? Tracking will be re-enabled.`);
      if (confirmed) {
        window.showLoadingModal("Restoring Website", `Restoring ${websiteName}...`);
        restoreButton.dataset.confirmed = "true";
        restoreButton.click();
      }
    } else if (restoreButton?.dataset.confirmed) {
      delete restoreButton.dataset.confirmed;
    }

    if (deleteButton && !deleteButton.dataset.confirmed) {
      e.preventDefault();
      const form = deleteButton.closest("form");
      if (!form) return;
      const websiteName = deleteButton.dataset.websiteName;
      const confirmedDelete = await window.customConfirm("Permanently Delete Website?", `You are about to permanently delete <strong>${websiteName}</strong>. This action cannot be undone.`);
      if (confirmedDelete) {
        const deleteData = await window.customAction("Delete Associated Data?", `Do you also want to permanently delete all associated analytics data for <strong>${websiteName}</strong>? This is highly recommended.`);
        const deleteDataInput = document.createElement("input");
        deleteDataInput.type = "hidden";
        deleteDataInput.name = "deleteData";
        deleteDataInput.value = deleteData;
        form.appendChild(deleteDataInput);
        window.showLoadingModal("Deleting Website", `Permanently deleting ${websiteName}...`);
        deleteButton.dataset.confirmed = "true";
        deleteButton.click();
      }
    } else if (deleteButton?.dataset.confirmed) {
      delete deleteButton.dataset.confirmed;
    }
  });

  applySettingsToUI();
});
