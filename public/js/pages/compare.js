const INTER_FONT_STACK = '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

document.addEventListener("DOMContentLoaded", () => {
  const charts = {};
  const slots = document.querySelectorAll(".compare-card");
  const manualRefreshBtn = document.getElementById("manual-refresh-btn");
  const dataPeriod = window.__INITIAL_PERIOD__ || 7;

  let settings = window.__SKOPOS_SETTINGS__ || {};
  try {
    const stored = localStorage.getItem("skopos-settings");
    if (stored) {
      settings = { ...settings, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.error("Failed to parse settings:", e);
  }

  function getThemeColors() {
    const computedStyle = getComputedStyle(document.documentElement);
    return {
      primary: computedStyle.getPropertyValue("--primary-color").trim(),
      textSecondary: computedStyle.getPropertyValue("--text-secondary").trim(),
      surface: computedStyle.getPropertyValue("--surface-color").trim(),
    };
  }

  async function fetchSlotData(slotId) {
    const slotElement = document.querySelector(`.compare-card[data-slot="${slotId}"]`);
    const websiteId = slotElement.querySelector(".website-select").value;
    const graphType = slotElement.querySelector(".graph-type-select").value;

    if (!websiteId) return;

    slotElement.classList.add("loading");
    try {
      const response = await fetch(`/dashboard/data/${websiteId}?period=${dataPeriod}`);
      if (!response.ok) throw new Error("Failed to fetch data");
      const data = await response.json();
      updateSlot(slotId, data, graphType);
    } catch (error) {
      console.error(`Error fetching data for slot ${slotId}:`, error);
    } finally {
      slotElement.classList.remove("loading");
    }
  }

  function updateSlot(slotId, data, graphType) {
    const slotElement = document.querySelector(`.compare-card[data-slot="${slotId}"]`);
    const valueEl = slotElement.querySelector(".compare-metric-value");
    const changeEl = slotElement.querySelector(".compare-metric-change");
    const chartContainer = document.getElementById(`chart-slot-${slotId}`);

    const metric = data.metrics;
    let value, change, trendData;

    switch (graphType) {
      case "pageViews":
        value = metric.pageViews;
        change = metric.change.pageViews;
        trendData = metric.trends.pageViews;
        break;
      case "visitors":
        const showUnique = settings.showUniqueVisitors || false;
        value = showUnique ? metric.newVisitors : metric.visitors;
        change = showUnique ? metric.change.newVisitors : metric.change.visitors;
        trendData = metric.trends.visitors;
        break;
      case "newVisitors":
        value = metric.newVisitors;
        change = metric.change.newVisitors;
        trendData = metric.trends.newVisitors;
        break;
      case "engagementRate":
        value = `${metric.engagementRate}%`;
        change = metric.change.engagementRate;
        trendData = metric.trends.engagementRate;
        break;
      case "bounceRate":
        value = `${metric.bounceRate}%`;
        change = metric.change.bounceRate;
        trendData = metric.trends.bounceRate;
        break;
      case "avgSessionDuration":
        value = metric.avgSessionDuration.formatted;
        change = metric.change.avgSessionDuration;
        trendData = metric.trends.avgSessionDuration;
        break;
      case "jsErrors":
        value = metric.jsErrors;
        change = 0;
        trendData = metric.trends.jsErrors;
        break;
    }

    valueEl.textContent = value;
    changeEl.className = "compare-metric-change";
    if (change >= 0) {
      changeEl.classList.add("positive");
      changeEl.innerHTML = `<i class="fa-solid fa-arrow-up"></i> ${change}%`;
    } else {
      changeEl.classList.add("negative");
      changeEl.innerHTML = `<i class="fa-solid fa-arrow-down"></i> ${Math.abs(change)}%`;
    }

    let yaxisFormatter = (val) => Math.round(val);
    if (graphType === "engagementRate" || graphType === "bounceRate") {
      yaxisFormatter = (val) => `${Math.round(val)}%`;
    } else if (graphType === "avgSessionDuration") {
      yaxisFormatter = (val) => {
        const mins = Math.floor(val / 60)
          .toString()
          .padStart(2, "0");
        const secs = Math.floor(val % 60)
          .toString()
          .padStart(2, "0");
        return `${mins}:${secs}`;
      };
    }

    if (charts[slotId]) {
      charts[slotId].updateOptions(
        {
          yaxis: {
            labels: {
              show: true,
              style: { colors: getThemeColors().textSecondary, fontSize: "10px" },
              formatter: yaxisFormatter,
            },
          },
        },
        false,
        false,
      );
    }

    renderChart(slotId, trendData, yaxisFormatter);
  }

  function renderChart(slotId, data, yaxisFormatter = (val) => Math.round(val)) {
    const containerId = `chart-slot-${slotId}`;
    const colors = getThemeColors();

    if (charts[slotId]) {
      charts[slotId].updateSeries([{ data: data }]);
      return;
    }

    const container = document.getElementById(containerId);
    container.innerHTML = "";

    const categories = [];
    const now = new Date();
    for (let i = data.length - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      categories.push(d.toLocaleDateString(undefined, { month: "short", day: "numeric" }));
    }

    const options = {
      series: [{ name: "Value", data: data }],
      chart: {
        type: "area",
        height: "100%",
        width: "100%",
        fontFamily: INTER_FONT_STACK,
        toolbar: { show: false },
        sparkline: { enabled: false },
        animations: { enabled: true },
      },
      colors: [colors.primary],
      stroke: { curve: "smooth", width: 2 },
      fill: {
        type: "gradient",
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.45,
          opacityTo: 0.05,
          stops: [20, 100, 100, 100],
        },
      },
      xaxis: {
        categories: categories,
        labels: {
          show: true,
          style: { colors: colors.textSecondary, fontSize: "10px" },
          rotate: -45,
          offsetY: 5,
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
        tooltip: { enabled: false },
      },
      yaxis: {
        labels: {
          show: true,
          style: { colors: colors.textSecondary, fontSize: "10px" },
          formatter: yaxisFormatter,
        },
      },
      grid: {
        show: true,
        borderColor: "rgba(0,0,0,0.05)",
        strokeDashArray: 4,
        padding: {
          bottom: 0,
          left: 10,
          right: 10,
        },
      },
      tooltip: {
        enabled: true,
        x: { show: true },
        theme: document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light",
      },
    };

    const chart = new ApexCharts(document.getElementById(containerId), options);
    chart.render();
    charts[slotId] = chart;
  }

  slots.forEach((slot) => {
    const slotId = slot.dataset.slot;
    const websiteSelect = slot.querySelector(".website-select");
    const graphTypeSelect = slot.querySelector(".graph-type-select");

    const savedWebsite = localStorage.getItem(`compare-slot-${slotId}-website`);
    const savedGraph = localStorage.getItem(`compare-slot-${slotId}-graph`);

    if (savedGraph) {
      graphTypeSelect.value = savedGraph;
    }

    if (savedWebsite) {
      websiteSelect.value = savedWebsite;
      fetchSlotData(slotId);
    }

    websiteSelect.addEventListener("change", () => {
      localStorage.setItem(`compare-slot-${slotId}-website`, websiteSelect.value);
      fetchSlotData(slotId);
    });

    graphTypeSelect.addEventListener("change", () => {
      localStorage.setItem(`compare-slot-${slotId}-graph`, graphTypeSelect.value);
      if (websiteSelect.value) {
        fetchSlotData(slotId);
      }
    });
  });

  if (manualRefreshBtn) {
    manualRefreshBtn.addEventListener("click", () => {
      slots.forEach((slot) => {
        if (slot.querySelector(".website-select").value) {
          fetchSlotData(slot.dataset.slot);
        }
      });
    });
  }

  const eventSource = new EventSource("/dashboard/events");
  eventSource.onmessage = (event) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch (e) {
      return;
    }

    if (data.type === "update") {
      slots.forEach((slot) => {
        const websiteId = slot.querySelector(".website-select").value;
        if (websiteId === data.websiteId) {
          fetchSlotData(slot.dataset.slot);
        }
      });
    }
  };

  window.addEventListener("themeChanged", () => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const colors = getThemeColors();
    Object.values(charts).forEach((chart) => {
      chart.updateOptions({
        stroke: { colors: [colors.primary] },
        tooltip: { theme: isDark ? "dark" : "light" },
      });
    });
  });
});
