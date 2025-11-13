(() => {
  const websiteId = document.querySelector(".page-wrapper")?.dataset.websiteId;
  if (!websiteId || !window.__UPTIME_DATA__) return;

  const { metrics, timeline, incidents } = window.__UPTIME_DATA__;
  const detailDrawerOverlay = document.getElementById("detail-drawer-overlay");

  let responseTimeChart = null;

  function getThemeColors() {
    const computedStyle = getComputedStyle(document.documentElement);
    const getColor = (variable, fallback) => {
      const value = computedStyle.getPropertyValue(variable)?.trim();
      return value || fallback;
    };
    return {
      primary: getColor("--primary-color", "#3b82f6"),
      border: getColor("--border-color", "rgba(0,0,0,0.08)"),
      surface: getColor("--surface-color", "transparent"),
      text: getColor("--text-primary", "#0f172a"),
      muted: getColor("--text-secondary", "#475569"),
    };
  }

  function renderUptimeTimeline() {
    const container = document.getElementById("uptime-timeline-chart");
    if (!container || !timeline || timeline.length === 0) return;

    container.innerHTML = "";

    const now = new Date();
    const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);
    const timeRange = now - twentyFourHoursAgo;

    const bucketSize = 5 * 60 * 1000;
    const buckets = new Map();

    for (const check of timeline) {
      const checkTime = new Date(check.timestamp);
      const bucketKey = Math.floor(checkTime.getTime() / bucketSize) * bucketSize;

      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, { up: 0, down: 0, totalResponseTime: 0, count: 0 });
      }

      const bucket = buckets.get(bucketKey);
      if (check.isUp) {
        bucket.up++;
      } else {
        bucket.down++;
      }
      bucket.totalResponseTime += check.responseTime;
      bucket.count++;
    }

    const sortedBuckets = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);

    for (const [timestamp, data] of sortedBuckets) {
      const bar = document.createElement("div");
      bar.className = "timeline-bar";

      const avgResponseTime = data.totalResponseTime / data.count;
      let status = "status-up";
      let title = "Operational";

      if (data.down > 0) {
        status = "status-down";
        title = `Down (${data.down}/${data.count} checks)`;
      } else if (avgResponseTime > 3000) {
        status = "status-degraded";
        title = `Slow (${Math.round(avgResponseTime)}ms avg)`;
      } else {
        title = `Operational (${Math.round(avgResponseTime)}ms avg)`;
      }

      bar.classList.add(status);
      bar.title = title;

      const bucketTime = new Date(timestamp);
      const relativePosition = ((bucketTime - twentyFourHoursAgo) / timeRange) * 100;
      bar.style.left = `${relativePosition}%`;

      container.appendChild(bar);
    }
  }

  function initResponseTimeChart() {
    const container = document.getElementById("response-time-chart");
    if (!container || !timeline || timeline.length === 0) return;

    if (responseTimeChart) {
      responseTimeChart.destroy();
      responseTimeChart = null;
    }

    const colors = getThemeColors();
    const dataPoints = timeline.map((check) => ({
      x: new Date(check.timestamp).getTime(),
      y: Number(check.responseTime) || 0,
    }));

    const options = {
      chart: {
        type: "area",
        height: 320,
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        toolbar: { show: false },
        animations: { enabled: false },
        background: "transparent",
        foreColor: colors.text,
      },
      series: [
        {
          name: "Response Time (ms)",
          data: dataPoints,
        },
      ],
      stroke: { curve: "smooth", width: 2, colors: [colors.primary] },
      fill: {
        type: "gradient",
        gradient: {
          shadeIntensity: 0.8,
          opacityFrom: 0.18,
          opacityTo: 0.01,
          stops: [0, 100],
          colorStops: [
            {
              offset: 0,
              color: colors.primary,
              opacity: 0.15,
            },
            {
              offset: 100,
              color: colors.primary,
              opacity: 0,
            },
          ],
        },
      },
      markers: { size: 0, hover: { size: 4 } },
      dataLabels: { enabled: false },
      grid: {
        borderColor: colors.border,
        strokeDashArray: 4,
      },
      tooltip: {
        theme: "dark",
        x: { format: "MMM dd, HH:mm" },
        y: {
          formatter(value) {
            return `${Math.round(value)} ms`;
          },
        },
      },
      xaxis: {
        type: "datetime",
        labels: {
          datetimeUTC: false,
          style: { colors: colors.muted },
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: {
        min: 0,
        labels: {
          formatter(value) {
            return `${Math.round(value)} ms`;
          },
          style: { colors: colors.muted },
        },
      },
      theme: {
        mode: document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light",
      },
    };

    responseTimeChart = new ApexCharts(container, options);
    responseTimeChart.render();
  }

  const manualCheckBtn = document.getElementById("manual-check-btn");
  if (manualCheckBtn) {
    manualCheckBtn.addEventListener("click", async () => {
      manualCheckBtn.disabled = true;
      manualCheckBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

      try {
        const response = await fetch(`/uptime/${websiteId}/check`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        });

        const data = await response.json();

        if (data.success) {
          const statusClass = data.result.isUp ? "success" : "danger";
          const statusText = data.result.isUp ? "UP" : "DOWN";
          const icon = data.result.isUp ? "circle-check" : "circle-xmark";

          showToast("Manual Check Complete", `Website is ${statusText}. Response time: ${data.result.responseTime}ms`, statusClass);

          setTimeout(() => window.location.reload(), 1500);
        }
      } catch (error) {
        console.error("Error performing manual check:", error);
        showToast("Error", "Failed to perform uptime check", "danger");
      } finally {
        manualCheckBtn.disabled = false;
        manualCheckBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
      }
    });
  }

  const uptimeSettingsBtn = document.getElementById("uptime-settings-btn");
  const websiteSettingsDrawer = document.getElementById("website-settings-drawer");
  const websiteSettingsClose = document.getElementById("website-settings-close");
  const ipBlacklistDrawer = document.getElementById("ip-blacklist-drawer");
  const ipBlacklistBtn = document.getElementById("manage-ip-blacklist-btn");
  const ipBlacklistClose = document.getElementById("ip-blacklist-close");
  const disableLocalhostToggle = document.getElementById("disable-localhost-toggle");
  const dataRetentionInput = document.getElementById("data-retention-input");
  const addIpForm = document.getElementById("add-ip-form");
  const ipAddressInput = document.getElementById("ip-address-input");
  const ipBlacklistTableBody = document.getElementById("ip-blacklist-table-body");
  const userIpAddressEl = document.getElementById("user-ip-address");
  const addUserIpBtn = document.getElementById("add-user-ip-btn");
  const removeUserIpBtn = document.getElementById("remove-user-ip-btn");

  let userCurrentIp = null;

  function closeOverlayIfNoDrawers() {
    const activeDrawers = document.querySelectorAll(".drawer.active");
    if (activeDrawers.length === 0) {
      detailDrawerOverlay?.classList.remove("active");
    }
  }

  if (uptimeSettingsBtn && websiteSettingsDrawer) {
    uptimeSettingsBtn.addEventListener("click", () => {
      websiteSettingsDrawer.classList.add("active");
      detailDrawerOverlay?.classList.add("active");
    });
  }

  if (websiteSettingsClose && websiteSettingsDrawer) {
    websiteSettingsClose.addEventListener("click", () => {
      websiteSettingsDrawer.classList.remove("active");
      if (!ipBlacklistDrawer?.classList.contains("active")) {
        closeOverlayIfNoDrawers();
      }
    });
  }

  if (ipBlacklistBtn && ipBlacklistDrawer) {
    ipBlacklistBtn.addEventListener("click", () => {
      ipBlacklistDrawer.classList.add("active");
      detailDrawerOverlay?.classList.add("active");
      fetchAndRenderIpBlacklist();
    });
  }

  if (ipBlacklistClose && ipBlacklistDrawer) {
    ipBlacklistClose.addEventListener("click", () => {
      ipBlacklistDrawer.classList.remove("active");
      if (!websiteSettingsDrawer?.classList.contains("active")) {
        closeOverlayIfNoDrawers();
      }
    });
  }

  if (detailDrawerOverlay) {
    detailDrawerOverlay.addEventListener("click", () => {
      const activeDrawers = document.querySelectorAll(".drawer.active");
      if (activeDrawers.length === 0) return;

      let topDrawer = null;
      if (ipBlacklistDrawer?.classList.contains("active")) {
        topDrawer = ipBlacklistDrawer;
      } else if (websiteSettingsDrawer?.classList.contains("active")) {
        topDrawer = websiteSettingsDrawer;
      }

      if (topDrawer) {
        topDrawer.classList.remove("active");
      }

      closeOverlayIfNoDrawers();
    });
  }

  async function updateWebsiteSetting(payload) {
    try {
      const response = await fetch(`/dashboard/settings/${websiteId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error("Failed to update setting");
      }
    } catch (error) {
      console.error("Error updating website setting:", error);
      window.customAlert?.("Error", "Failed to update website setting.");
    }
  }

  if (disableLocalhostToggle) {
    disableLocalhostToggle.addEventListener("change", (e) => {
      updateWebsiteSetting({
        disableLocalhostTracking: e.target.checked,
      });
    });
  }

  if (dataRetentionInput) {
    dataRetentionInput.addEventListener("change", (e) => {
      updateWebsiteSetting({
        dataRetentionDays: Number.parseInt(e.target.value, 10) || 0,
      });
    });
  }

  async function fetchUserIp() {
    try {
      const response = await fetch("/api/user-ip");
      const data = await response.json();
      userCurrentIp = data.ip;
      if (userIpAddressEl) {
        userIpAddressEl.textContent = userCurrentIp;
      }
    } catch (error) {
      console.error("Failed to fetch user IP:", error);
      if (userIpAddressEl) {
        userIpAddressEl.textContent = "Unable to detect";
      }
    }
  }

  function updateUserIpButtons(ipList) {
    if (!userCurrentIp || !addUserIpBtn || !removeUserIpBtn) return;

    const isBlocked = ipList.includes(userCurrentIp);
    if (isBlocked) {
      addUserIpBtn.style.display = "none";
      removeUserIpBtn.style.display = "inherit";
    } else {
      addUserIpBtn.style.display = "inherit";
      removeUserIpBtn.style.display = "none";
    }
  }

  async function fetchAndRenderIpBlacklist() {
    if (!websiteId || !ipBlacklistTableBody) return;

    if (!userCurrentIp) {
      await fetchUserIp();
    }

    try {
      const response = await fetch(`/dashboard/settings/${websiteId}`);
      const data = await response.json();
      const ipList = data.ipBlacklist || [];

      updateUserIpButtons(ipList);

      ipBlacklistTableBody.innerHTML = ipList
        .map(
          (ip) => `
        <tr>
          <td>${ip}</td>
          <td style="text-align: right;">
            <button class="btn-icon btn-danger remove-ip-btn" data-ip="${ip}">
              <i class="fa-solid fa-trash"></i>
            </button>
          </td>
        </tr>
      `,
        )
        .join("");
    } catch (error) {
      console.error("Failed to fetch IP blacklist:", error);
      if (ipBlacklistTableBody) {
        ipBlacklistTableBody.innerHTML = '<tr><td colspan="2">Failed to load IPs.</td></tr>';
      }
    }
  }

  if (addIpForm && ipAddressInput) {
    addIpForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const ip = ipAddressInput.value.trim();
      if (!ip || !websiteId) return;

      try {
        const response = await fetch(`/dashboard/blacklist/${websiteId}/add`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ip }),
        });
        if (response.ok) {
          ipAddressInput.value = "";
          fetchAndRenderIpBlacklist();
        } else {
          const errorData = await response.json();
          window.customAlert?.("Error", errorData.error || "Failed to add IP address.");
        }
      } catch (error) {
        window.customAlert?.("Error", "Failed to add IP address.");
      }
    });
  }

  if (addUserIpBtn) {
    addUserIpBtn.addEventListener("click", async () => {
      if (!userCurrentIp || !websiteId) return;

      try {
        const response = await fetch(`/dashboard/blacklist/${websiteId}/add`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ip: userCurrentIp }),
        });
        if (response.ok) {
          fetchAndRenderIpBlacklist();
        } else {
          const errorData = await response.json();
          window.customAlert?.("Error", errorData.error || "Failed to add your IP address.");
        }
      } catch (error) {
        window.customAlert?.("Error", "Failed to add your IP address to blocklist.");
      }
    });
  }

  if (removeUserIpBtn) {
    removeUserIpBtn.addEventListener("click", async () => {
      if (!userCurrentIp || !websiteId) return;

      try {
        const response = await fetch(`/dashboard/blacklist/${websiteId}/remove`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ip: userCurrentIp }),
        });
        if (response.ok) {
          fetchAndRenderIpBlacklist();
        } else {
          window.customAlert?.("Error", "Failed to remove your IP address from blocklist.");
        }
      } catch (error) {
        window.customAlert?.("Error", "Failed to remove your IP address from blocklist.");
      }
    });
  }

  if (ipBlacklistTableBody) {
    ipBlacklistTableBody.addEventListener("click", async (e) => {
      const removeBtn = e.target.closest(".remove-ip-btn");
      if (!removeBtn || !websiteId) return;

      const ip = removeBtn.dataset.ip;
      try {
        const response = await fetch(`/dashboard/blacklist/${websiteId}/remove`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ip }),
        });
        if (response.ok) {
          fetchAndRenderIpBlacklist();
        } else {
          window.customAlert?.("Error", "Failed to remove IP address.");
        }
      } catch (error) {
        window.customAlert?.("Error", "Failed to remove IP address.");
      }
    });
  }

  const uptimeMonitoringToggle = document.getElementById("uptime-monitoring-toggle");
  if (uptimeMonitoringToggle) {
    uptimeMonitoringToggle.addEventListener("change", async (e) => {
      const enabled = e.target.checked;

      try {
        const response = await fetch(`/uptime/${websiteId}/toggle`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ enabled }),
        });

        const data = await response.json();

        if (data.success) {
          showToast("Uptime Monitoring", `Uptime monitoring ${enabled ? "enabled" : "disabled"}`, "success");
        }
      } catch (error) {
        console.error("Error toggling uptime monitoring:", error);
        showToast("Error", "Failed to update uptime monitoring", "danger");
        e.target.checked = !enabled;
      }
    });
  }

  const checkIntervalSelect = document.getElementById("uptime-check-interval-select");
  if (checkIntervalSelect) {
    checkIntervalSelect.addEventListener("change", async (e) => {
      const interval = Number.parseInt(e.target.value);

      try {
        const response = await fetch(`/uptime/${websiteId}/interval`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ interval }),
        });

        const data = await response.json();

        if (data.success) {
          showToast("Check Interval Updated", `Check interval set to ${interval} seconds`, "success");
        }
      } catch (error) {
        console.error("Error updating check interval:", error);
        showToast("Error", "Failed to update check interval", "danger");
      }
    });
  }

  document.addEventListener("click", async (e) => {
    const resolveBtn = e.target.closest(".resolve-incident-btn");
    if (!resolveBtn) return;

    const incidentId = resolveBtn.dataset.incidentId;
    if (!incidentId) return;

    const confirmed = await customConfirm("Resolve Incident", "Are you sure you want to manually resolve this incident?");

    if (!confirmed) return;

    resolveBtn.disabled = true;
    resolveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    try {
      const response = await fetch(`/uptime/${websiteId}/incidents/${incidentId}/resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (data.success) {
        showToast("Incident Resolved", "The incident has been marked as resolved", "success");
        setTimeout(() => window.location.reload(), 1000);
      }
    } catch (error) {
      console.error("Error resolving incident:", error);
      showToast("Error", "Failed to resolve incident", "danger");
      resolveBtn.disabled = false;
      resolveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Mark Resolved';
    }
  });

  function showToast(title, message, type = "info") {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <div class="toast-header">
        <strong>${title}</strong>
        <button class="toast-close">&times;</button>
      </div>
      <div class="toast-body">${message}</div>
    `;

    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add("show"), 10);

    const closeBtn = toast.querySelector(".toast-close");
    closeBtn?.addEventListener("click", () => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    });

    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  }

  renderUptimeTimeline();
  initResponseTimeChart();

  const observer = new MutationObserver(() => {
    initResponseTimeChart();
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
})();
