document.addEventListener("DOMContentLoaded", () => {
  const sidebarToggle = document.getElementById("sidebar-toggle");
  const mobileSidebarToggle = document.getElementById("mobile-sidebar-toggle");
  const sidebar = document.getElementById("sidebar");
  const settingsBtn = document.getElementById("settings-btn");
  const settingsDrawerOverlay = document.getElementById("settings-drawer-overlay");
  const settingsDrawer = document.getElementById("settings-drawer");
  const settingsClose = document.getElementById("settings-close");

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

  function openSettingsDrawer() {
    if (settingsDrawerOverlay && settingsDrawer) {
      settingsDrawerOverlay.classList.add("active");
      settingsDrawer.classList.add("active");
    }
  }

  function closeSettingsDrawer() {
    if (settingsDrawerOverlay && settingsDrawer) {
      settingsDrawerOverlay.classList.remove("active");
      settingsDrawer.classList.remove("active");
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

  if (settingsBtn) {
    settingsBtn.addEventListener("click", openSettingsDrawer);
  }

  if (settingsClose) {
    settingsClose.addEventListener("click", closeSettingsDrawer);
  }

  if (settingsDrawerOverlay) {
    settingsDrawerOverlay.addEventListener("click", closeSettingsDrawer);
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
        console.log("Archiving website:", websiteName);
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
        console.log("Restoring website:", websiteName);
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
        deleteButton.dataset.confirmed = "true";
        deleteButton.click();
      }
    } else if (deleteButton?.dataset.confirmed) {
      delete deleteButton.dataset.confirmed;
    }
  });

  applySettingsToUI();
});
