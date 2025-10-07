document.addEventListener("DOMContentLoaded", () => {
  const sidebarToggle = document.getElementById("sidebar-toggle");
  const sidebar = document.getElementById("sidebar");
  const pageWrapper = document.querySelector(".page-wrapper");
  const WEBSITE_ID = pageWrapper ? pageWrapper.dataset.websiteId : null;
  const UPDATE_INTERVAL = 5000;
  const progressBar = document.getElementById("update-progress-bar");

  if (sidebarToggle) {
    sidebarToggle.addEventListener("click", () => {
      sidebar.classList.toggle("open");
    });
  }

  let chart = null;
  const chartElement = document.getElementById("analytics-chart");

  function initializeChart(initialData) {
    const hasData = initialData.length > 0 && initialData[0].data.some((point) => point[1] > 0);

    const options = {
      series: hasData ? initialData : [],
      chart: {
        height: 350,
        type: "area",
        toolbar: {
          show: false,
        },
        zoom: {
          enabled: false,
        },
        animations: {
          enabled: true,
          easing: "easeinout",
          speed: 800,
        },
      },
      dataLabels: {
        enabled: false,
      },
      stroke: {
        curve: "smooth",
        width: 2,
      },
      xaxis: {
        type: "datetime",
        labels: {
          style: {
            colors: "#64748b",
          },
        },
      },
      yaxis: {
        labels: {
          style: {
            colors: "#64748b",
          },
        },
      },
      tooltip: {
        x: {
          format: "dd MMM yyyy",
        },
      },
      grid: {
        borderColor: "#e2e8f0",
      },
      fill: {
        type: "gradient",
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.7,
          opacityTo: 0.2,
          stops: [0, 90, 100],
        },
      },
      colors: ["#4f46e5"],
      noData: {
        text: "No page view data available for this period.",
        align: "center",
        verticalAlign: "middle",
        offsetX: 0,
        offsetY: 0,
        style: {
          color: "#475569",
          fontSize: "14px",
        },
      },
    };

    if (chart) {
      chart.destroy();
    }

    chart = new ApexCharts(chartElement, options);
    chart.render();
  }

  if (chartElement && typeof chartData !== "undefined") {
    initializeChart(chartData);
  }

  function updateMetricCard(metricId, value, change) {
    const valueElement = document.getElementById(`${metricId}-value`);
    const changeElement = document.getElementById(`${metricId}-change`);
    if (valueElement) {
      valueElement.textContent = value;
    }
    if (changeElement) {
      changeElement.className = "metric-change";
      if (change >= 0) {
        changeElement.classList.add("positive");
        changeElement.innerHTML = `<i class="fa-solid fa-arrow-up"></i> ${change}%`;
      } else {
        changeElement.classList.add("negative");
        changeElement.innerHTML = `<i class="fa-solid fa-arrow-down"></i> ${Math.abs(change)}%`;
      }
    }
  }

  function updateReportCard(reportId, data) {
    const reportContainer = document.getElementById(reportId);
    if (!reportContainer) return;

    if (!data || data.length === 0) {
      reportContainer.innerHTML = '<p class="no-data">No data available for this report.</p>';
      return;
    }

    let html = `
      <div class="report-table-header">
        <span>Item</span>
        <span>Views</span>
      </div>
      <ul class="report-table-list">
    `;

    for (const item of data) {
      html += `
        <li>
          <div class="list-item-info">
            <span class="list-item-key">${item.key}</span>
            <span class="list-item-count">${item.count}</span>
          </div>
          <div class="progress-bar-container">
            <div class="progress-bar" style="width: ${item.percentage}%"></div>
          </div>
        </li>
      `;
    }

    html += "</ul>";
    reportContainer.innerHTML = html;
  }

  function processUpdate(data) {
    const activeUsersCountEl = document.getElementById("active-users-count");
    if (activeUsersCountEl && typeof data.activeUsers !== "undefined") {
      activeUsersCountEl.textContent = data.activeUsers;
    }

    if (data.metrics) {
      updateMetricCard("pageviews", data.metrics.pageViews, data.metrics.change.pageViews);
      updateMetricCard("visitors", data.metrics.visitors, data.metrics.change.visitors);
      updateMetricCard("bouncerate", `${data.metrics.bounceRate}%`, data.metrics.change.bounceRate);
      updateMetricCard("avgsession", data.metrics.avgSessionDuration.formatted, data.metrics.change.avgSessionDuration);
    }

    if (data.reports) {
      updateReportCard("report-top-pages", data.reports.topPages);
      updateReportCard("report-top-referrers", data.reports.topReferrers);
      updateReportCard("report-custom-events", data.reports.topCustomEvents);
      updateReportCard("report-devices", data.reports.deviceBreakdown);
      updateReportCard("report-browsers", data.reports.browserBreakdown);
      updateReportCard("report-languages", data.reports.languageBreakdown);
      updateReportCard("report-utm-source", data.reports.utmSourceBreakdown);
      updateReportCard("report-utm-medium", data.reports.utmMediumBreakdown);
      updateReportCard("report-utm-campaign", data.reports.utmCampaignBreakdown);
    }

    if (data.chartData && chart) {
      const hasData = data.chartData.length > 0 && data.chartData[0].data.some((point) => point[1] > 0);
      chart.updateSeries(hasData ? data.chartData : []);
    }
  }

  async function fetchDashboardData(websiteId) {
    try {
      const response = await fetch(`/dashboard/data/${websiteId}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      processUpdate(data);
    } catch (error) {
      console.error("[Dashboard ERROR] Failed to fetch dashboard data:", error);
    }
  }

  function animateProgressBar() {
    if (!progressBar) return;

    progressBar.classList.add("no-transition");
    progressBar.style.width = "100%";

    setTimeout(() => {
      progressBar.classList.remove("no-transition");
      progressBar.style.width = "0%";
    }, 50);
  }

  window.addEventListener("load", () => {
    const loadingCards = document.querySelectorAll(".loading");
    for (const card of loadingCards) {
      card.classList.remove("loading");
    }
  });

  if (WEBSITE_ID) {
    animateProgressBar();
    setInterval(() => {
      fetchDashboardData(WEBSITE_ID);
      animateProgressBar();
    }, UPDATE_INTERVAL);
  }
});
