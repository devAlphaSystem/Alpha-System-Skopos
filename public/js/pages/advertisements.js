document.addEventListener("DOMContentLoaded", () => {
  const pageWrapper = document.querySelector(".page-wrapper");
  const WEBSITE_ID = pageWrapper ? pageWrapper.dataset.websiteId : null;
  const isArchived = pageWrapper ? pageWrapper.dataset.isArchived === "true" : false;

  const createAdBtn = document.getElementById("create-ad-btn");
  const emptyCreateBtn = document.getElementById("empty-create-btn");
  const generateFromSeoBtn = document.getElementById("generate-from-seo-btn");
  const emptyGenerateBtn = document.getElementById("empty-generate-btn");

  const adModal = document.getElementById("ad-modal-overlay");
  const adModalDialog = document.getElementById("ad-modal");
  const closeAdModal = document.getElementById("close-ad-modal");
  const cancelAdBtn = document.getElementById("cancel-ad-btn");
  const saveAdBtn = document.getElementById("save-ad-btn");
  const adForm = document.getElementById("ad-form");
  const bannerPreview = document.getElementById("banner-preview");

  const embedModal = document.getElementById("embed-modal-overlay");
  const embedModalDialog = document.getElementById("embed-modal");
  const closeEmbedModal = document.getElementById("close-embed-modal");
  const closeEmbedBtn = document.getElementById("close-embed-btn");

  const metricsModal = document.getElementById("metrics-modal-overlay");
  const metricsModalDialog = document.getElementById("metrics-modal");
  const closeMetricsModal = document.getElementById("close-metrics-modal");
  const closeMetricsBtn = document.getElementById("close-metrics-btn");
  const metricsPeriod = document.getElementById("metrics-period");

  const generateModal = document.getElementById("generate-modal-overlay");
  const generateModalDialog = document.getElementById("generate-modal");
  const closeGenerateModal = document.getElementById("close-generate-modal");
  const cancelGenerateBtn = document.getElementById("cancel-generate-btn");
  const confirmGenerateBtn = document.getElementById("confirm-generate-btn");

  let currentEditId = null;
  let currentMetricsId = null;

  function openAdModal(editId = null) {
    if (isArchived) return;

    currentEditId = editId;
    document.getElementById("ad-modal-title").textContent = editId ? "Edit Advertisement" : "Create Advertisement";

    if (editId) {
      loadAdData(editId);
    } else {
      adForm.reset();
      document.getElementById("ad-cta").value = "Learn More";
      bannerPreview.innerHTML = '<i class="fa-solid fa-image"></i><span>Preview will appear here</span>';
      bannerPreview.classList.add("banner-preview-placeholder");
    }

    adModal.classList.add("active");
    if (adModalDialog) adModalDialog.classList.add("active");
  }

  function closeAdModalFn() {
    adModal.classList.remove("active");
    if (adModalDialog) adModalDialog.classList.remove("active");
    currentEditId = null;
    adForm.reset();
  }

  async function loadAdData(adId) {
    const adCard = document.querySelector(`.ad-card[data-ad-id="${adId}"]`);
    if (!adCard) return;

    window.showLoadingModal("Loading...", "Fetching advertisement data");

    try {
      const response = await fetch(`/dashboard/ads/${WEBSITE_ID}/${adId}/embed`);
      if (!response.ok) throw new Error("Failed to load ad data");

      const data = await response.json();
      const ad = data.ad;

      if (!ad) throw new Error("Could not find advertisement details");

      document.getElementById("ad-name").value = ad.description || "";
      document.getElementById("ad-size").value = ad.bannerSize || "300x250";
      document.getElementById("ad-title").value = ad.title || "";
      document.getElementById("ad-subtitle").value = ad.bannerConfig?.subtitle || "";
      document.getElementById("ad-image-url").value = ad.bannerConfig?.imageUrl || "";
      document.getElementById("ad-cta").value = ad.ctaText || "Learn More";
      document.getElementById("ad-logo").value = ad.bannerConfig?.logoText || "";
      document.getElementById("ad-logo-url").value = ad.bannerConfig?.logoUrl || "";
      document.getElementById("ad-badge-text").value = ad.bannerConfig?.badgeText || "";
      document.getElementById("ad-target-url").value = ad.targetUrl || "";

      const radio = document.querySelector(`input[name="colorScheme"][value="${ad.bannerConfig?.colorScheme || "brand"}"]`);
      if (radio) radio.checked = true;

      window.hideLoadingModal();
      refreshPreview();
    } catch (error) {
      window.hideLoadingModal();
      console.error("Error loading ad data:", error);
      window.customAlert("Error", "Failed to load advertisement data");
    }
  }

  async function refreshPreview() {
    const sizeEl = document.getElementById("ad-size");
    const titleEl = document.getElementById("ad-title");

    if (!sizeEl || !titleEl) return;

    const formData = {
      size: sizeEl.value,
      title: titleEl.value || "Your Ad Title",
      subtitle: document.getElementById("ad-subtitle")?.value || "",
      imageUrl: document.getElementById("ad-image-url")?.value || "",
      ctaText: document.getElementById("ad-cta")?.value || "Learn More",
      logoText: document.getElementById("ad-logo")?.value || "A",
      logoUrl: document.getElementById("ad-logo-url")?.value || "",
      badgeText: document.getElementById("ad-badge-text")?.value || "",
      isAnimated: true,
      colorScheme: document.querySelector('input[name="colorScheme"]:checked')?.value || "brand",
    };

    try {
      const response = await fetch("/dashboard/ads/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error("Preview failed");

      const data = await response.json();
      bannerPreview.innerHTML = data.svgContent;
      bannerPreview.classList.remove("banner-preview-placeholder");
    } catch (error) {
      console.error("Error generating preview:", error);
      bannerPreview.innerHTML = '<i class="fa-solid fa-exclamation-triangle"></i><span>Preview failed</span>';
    }
  }

  async function saveAdvertisement() {
    if (isArchived) return;

    const formData = {
      name: document.getElementById("ad-name").value.trim(),
      size: document.getElementById("ad-size").value,
      title: document.getElementById("ad-title").value.trim(),
      subtitle: document.getElementById("ad-subtitle").value.trim(),
      imageUrl: document.getElementById("ad-image-url").value.trim(),
      ctaText: document.getElementById("ad-cta").value.trim() || "Learn More",
      logoText: document.getElementById("ad-logo").value.trim(),
      logoUrl: document.getElementById("ad-logo-url").value.trim(),
      badgeText: document.getElementById("ad-badge-text").value.trim(),
      isAnimated: true,
      targetUrl: document.getElementById("ad-target-url").value.trim(),
      colorScheme: document.querySelector('input[name="colorScheme"]:checked')?.value || "brand",
    };

    if (!formData.name) {
      window.customAlert("Validation Error", "Advertisement name is required");
      return;
    }

    if (!formData.title) {
      window.customAlert("Validation Error", "Banner title is required");
      return;
    }

    window.showLoadingModal(currentEditId ? "Updating..." : "Creating...", "Please wait");

    try {
      const url = currentEditId ? `/dashboard/ads/${WEBSITE_ID}/${currentEditId}` : `/dashboard/ads/${WEBSITE_ID}/create`;

      const method = currentEditId ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save advertisement");
      }

      window.hideLoadingModal();
      closeAdModalFn();
      window.location.reload();
    } catch (error) {
      window.hideLoadingModal();
      console.error("Error saving advertisement:", error);
      window.customAlert("Error", error.message);
    }
  }

  function openEmbedModal(adId) {
    fetchEmbedCode(adId);
    embedModal.classList.add("active");
    if (embedModalDialog) embedModalDialog.classList.add("active");
  }

  function closeEmbedModalFn() {
    embedModal.classList.remove("active");
    if (embedModalDialog) embedModalDialog.classList.remove("active");
  }

  async function fetchEmbedCode(adId) {
    try {
      const response = await fetch(`/dashboard/ads/${WEBSITE_ID}/${adId}/embed`);
      if (!response.ok) throw new Error("Failed to fetch embed code");

      const data = await response.json();

      document.getElementById("embed-code-simple").textContent = data.embedCode;
      document.getElementById("embed-code-responsive").textContent = data.htmlEmbed;
      document.getElementById("embed-code-javascript").textContent = data.jsEmbed;
      document.getElementById("embed-banner-url").textContent = data.bannerUrl;
      document.getElementById("embed-click-url").textContent = data.clickUrl;
      document.getElementById("embed-dimensions").textContent = `${data.size.width}×${data.size.height}`;
    } catch (error) {
      console.error("Error fetching embed code:", error);
      window.customAlert("Error", "Failed to load embed code");
    }
  }

  function openMetricsModal(adId) {
    currentMetricsId = adId;
    const adCard = document.querySelector(`.ad-card[data-ad-id="${adId}"]`);
    const adName = adCard ? adCard.querySelector(".ad-name").textContent : "Advertisement";
    const modalTitle = document.getElementById("metrics-modal-title");
    if (modalTitle) modalTitle.textContent = `${adName} - Metrics`;

    fetchMetrics(adId, metricsPeriod ? metricsPeriod.value : "30");
    metricsModal.classList.add("active");
    if (metricsModalDialog) metricsModalDialog.classList.add("active");
  }

  function closeMetricsModalFn() {
    metricsModal.classList.remove("active");
    if (metricsModalDialog) metricsModalDialog.classList.remove("active");
    currentMetricsId = null;
  }

  async function fetchMetrics(adId, period) {
    try {
      const response = await fetch(`/dashboard/ads/${WEBSITE_ID}/${adId}/metrics?period=${period}`);
      if (!response.ok) throw new Error("Failed to fetch metrics");

      const data = await response.json();
      const metrics = data.metrics;

      document.getElementById("metrics-impressions").textContent = metrics.totalImpressions.toLocaleString();
      document.getElementById("metrics-clicks").textContent = metrics.totalClicks.toLocaleString();
      document.getElementById("metrics-ctr").textContent = `${metrics.ctr}%`;
      document.getElementById("metrics-period-clicks").textContent = metrics.periodClicks.toLocaleString();

      renderMetricsList("metrics-by-country", metrics.clicksByCountry, window.__COUNTRY_NAMES__ || {});
      renderMetricsList("metrics-by-device", metrics.clicksByDevice);
      renderMetricsList("metrics-by-browser", metrics.clicksByBrowser);

      document.getElementById("metrics-last-impression").textContent = metrics.lastImpression ? window.formatDateShort(metrics.lastImpression) : "Never";

      document.getElementById("metrics-last-click").textContent = metrics.lastClick ? window.formatDateShort(metrics.lastClick) : "Never";
    } catch (error) {
      console.error("Error fetching metrics:", error);
      window.customAlert("Error", "Failed to load metrics");
    }
  }

  function renderMetricsList(containerId, data, nameMap = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!data || Object.keys(data).length === 0) {
      container.innerHTML = '<div class="metrics-empty">No data available</div>';
      return;
    }

    const sorted = Object.entries(data)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const total = sorted.reduce((sum, [, count]) => sum + count, 0);

    container.innerHTML = sorted
      .map(([key, count]) => {
        const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
        const displayName = nameMap[key] || key;
        return `
        <div class="metrics-list-item">
          <div class="metrics-list-label">${displayName}</div>
          <div class="metrics-list-bar">
            <div class="metrics-list-fill" style="width: ${percentage}%"></div>
          </div>
          <div class="metrics-list-value">${count} (${percentage}%)</div>
        </div>
      `;
      })
      .join("");
  }

  function openGenerateModal() {
    if (isArchived) return;
    generateModal.classList.add("active");
    if (generateModalDialog) generateModalDialog.classList.add("active");
  }

  function closeGenerateModalFn() {
    generateModal.classList.remove("active");
    if (generateModalDialog) generateModalDialog.classList.remove("active");
  }

  async function generateFromSeoData() {
    if (isArchived) return;

    const size = document.getElementById("generate-size").value;
    const colorScheme = document.querySelector('input[name="generateColorScheme"]:checked')?.value || "brand";

    window.showLoadingModal("Generating...", "Creating ad from SEO data...");

    try {
      const response = await fetch(`/dashboard/ads/${WEBSITE_ID}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ size, colorScheme }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate advertisement");
      }

      window.hideLoadingModal();
      closeGenerateModalFn();
      window.location.reload();
    } catch (error) {
      window.hideLoadingModal();
      console.error("Error generating advertisement:", error);
      window.customAlert("Error", error.message);
    }
  }

  async function toggleAdStatus(adId) {
    if (isArchived) return;

    const actionBtn = document.querySelector(`[data-action="toggle"][data-ad-id="${adId}"]`);
    if (actionBtn) {
      actionBtn.disabled = true;
    }

    try {
      const response = await fetch(`/dashboard/ads/${WEBSITE_ID}/${adId}/toggle`, {
        method: "POST",
      });

      if (!response.ok) throw new Error("Failed to toggle status");

      const data = await response.json();

      const adCard = document.querySelector(`.ad-card[data-ad-id="${adId}"]`);
      if (adCard) {
        const statusEl = adCard.querySelector(".ad-status");
        if (statusEl) {
          statusEl.className = `ad-status ${data.isActive ? "active" : "inactive"}`;
          statusEl.querySelector("span:last-child").textContent = data.isActive ? "Active" : "Paused";
        }

        if (actionBtn) {
          actionBtn.title = data.isActive ? "Pause" : "Activate";
          const icon = actionBtn.querySelector("i");
          if (icon) {
            icon.className = `fa-solid ${data.isActive ? "fa-pause" : "fa-play"}`;
          }
          if (data.isActive) {
            actionBtn.classList.remove("btn-success");
          } else {
            actionBtn.classList.add("btn-success");
          }
        }
      }
    } catch (error) {
      console.error("Error toggling ad status:", error);
      window.customAlert("Error", "Failed to toggle advertisement status");
    } finally {
      if (actionBtn) {
        actionBtn.disabled = false;
      }
    }
  }

  async function deleteAd(adId) {
    if (isArchived) return;

    const confirmed = await window.customConfirm("Delete Advertisement", "Are you sure you want to delete this advertisement? This action cannot be undone.");

    if (!confirmed) return;

    window.showLoadingModal("Deleting...", "Please wait");

    try {
      const response = await fetch(`/dashboard/ads/${WEBSITE_ID}/${adId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete advertisement");

      window.hideLoadingModal();
      window.location.reload();
    } catch (error) {
      window.hideLoadingModal();
      console.error("Error deleting advertisement:", error);
      window.customAlert("Error", "Failed to delete advertisement");
    }
  }

  if (createAdBtn) createAdBtn.addEventListener("click", () => openAdModal());
  if (emptyCreateBtn) emptyCreateBtn.addEventListener("click", () => openAdModal());
  if (closeAdModal) closeAdModal.addEventListener("click", closeAdModalFn);
  if (cancelAdBtn) cancelAdBtn.addEventListener("click", closeAdModalFn);
  if (saveAdBtn) saveAdBtn.addEventListener("click", saveAdvertisement);

  ["ad-title", "ad-subtitle", "ad-image-url", "ad-cta", "ad-logo", "ad-logo-url", "ad-badge-text", "ad-size"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("change", refreshPreview);
      if (el.tagName === "INPUT") {
        el.addEventListener("input", debounce(refreshPreview, 500));
      }
    }
  });

  document.querySelectorAll('input[name="colorScheme"]').forEach((radio) => {
    radio.addEventListener("change", refreshPreview);
  });

  if (generateFromSeoBtn) generateFromSeoBtn.addEventListener("click", openGenerateModal);
  if (emptyGenerateBtn) emptyGenerateBtn.addEventListener("click", openGenerateModal);
  if (closeGenerateModal) closeGenerateModal.addEventListener("click", closeGenerateModalFn);
  if (cancelGenerateBtn) cancelGenerateBtn.addEventListener("click", closeGenerateModalFn);
  if (confirmGenerateBtn) confirmGenerateBtn.addEventListener("click", generateFromSeoData);

  if (closeEmbedModal) closeEmbedModal.addEventListener("click", closeEmbedModalFn);
  if (closeEmbedBtn) closeEmbedBtn.addEventListener("click", closeEmbedModalFn);

  if (closeMetricsModal) closeMetricsModal.addEventListener("click", closeMetricsModalFn);
  if (closeMetricsBtn) closeMetricsBtn.addEventListener("click", closeMetricsModalFn);
  if (metricsPeriod) {
    metricsPeriod.addEventListener("change", () => {
      if (currentMetricsId) {
        fetchMetrics(currentMetricsId, metricsPeriod.value);
      }
    });
  }

  document.querySelectorAll(".embed-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".embed-tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".embed-content").forEach((c) => (c.style.display = "none"));

      tab.classList.add("active");
      const targetId = `embed-${tab.dataset.tab}`;
      document.getElementById(targetId).style.display = "block";
    });
  });

  document.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const targetId = btn.dataset.target;
      const targetEl = document.getElementById(targetId);
      if (!targetEl) return;

      try {
        await navigator.clipboard.writeText(targetEl.textContent);

        const originalIcon = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-check"></i>';
        btn.classList.add("copied");

        setTimeout(() => {
          btn.innerHTML = originalIcon;
          btn.classList.remove("copied");
        }, 2000);
      } catch (error) {
        console.error("Failed to copy:", error);
      }
    });
  });

  document.addEventListener("click", (e) => {
    const actionBtn = e.target.closest("[data-action]");
    if (!actionBtn) return;

    const action = actionBtn.dataset.action;
    const adId = actionBtn.dataset.adId;

    switch (action) {
      case "embed":
        openEmbedModal(adId);
        break;
      case "metrics":
        openMetricsModal(adId);
        break;
      case "edit":
        openAdModal(adId);
        break;
      case "toggle":
        toggleAdStatus(adId);
        break;
      case "delete":
        deleteAd(adId);
        break;
    }
  });

  [
    { overlay: adModal, closeFn: closeAdModalFn },
    { overlay: embedModal, closeFn: closeEmbedModalFn },
    { overlay: metricsModal, closeFn: closeMetricsModalFn },
    { overlay: generateModal, closeFn: closeGenerateModalFn },
  ].forEach(({ overlay, closeFn }) => {
    if (overlay) {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
          closeFn();
        }
      });
    }
  });

  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
});
