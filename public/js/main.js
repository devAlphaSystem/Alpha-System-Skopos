document.addEventListener("DOMContentLoaded", () => {
  const sidebarToggle = document.getElementById("sidebar-toggle");
  const sidebar = document.getElementById("sidebar");
  const settingsBtn = document.getElementById("settings-btn");
  const settingsDrawerOverlay = document.getElementById("settings-drawer-overlay");
  const settingsDrawer = document.getElementById("settings-drawer");
  const settingsClose = document.getElementById("settings-close");

  const DEFAULT_SETTINGS = {
    theme: "light",
    refreshRate: 10000,
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

  applySettingsToUI();
});
