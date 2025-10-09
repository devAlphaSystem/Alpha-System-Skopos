document.addEventListener("DOMContentLoaded", () => {
  const pageWrapper = document.querySelector(".page-wrapper");
  const WEBSITE_ID = pageWrapper ? pageWrapper.dataset.websiteId : null;
  const progressBar = document.getElementById("update-progress-bar");
  const detailDrawerOverlay = document.getElementById("detail-drawer-overlay");
  const detailDrawer = document.getElementById("detail-drawer");
  const detailDrawerClose = document.getElementById("detail-drawer-close");
  const manualRefreshBtn = document.getElementById("manual-refresh-btn");
  const dataPeriodLabel = document.getElementById("data-period-label");

  let settings = window.__SKOPOS_SETTINGS__;
  let refreshInterval = null;
  let lineChart = null;
  let worldMap = null;

  const countryNames = {
    AF: "Afghanistan",
    AX: "Aland Islands",
    AL: "Albania",
    DZ: "Algeria",
    AS: "American Samoa",
    AD: "Andorra",
    AO: "Angola",
    AI: "Anguilla",
    AQ: "Antarctica",
    AG: "Antigua and Barbuda",
    AR: "Argentina",
    AM: "Armenia",
    AW: "Aruba",
    AU: "Australia",
    AT: "Austria",
    AZ: "Azerbaijan",
    BS: "Bahamas",
    BH: "Bahrain",
    BD: "Bangladesh",
    BB: "Barbados",
    BY: "Belarus",
    BE: "Belgium",
    BZ: "Belize",
    BJ: "Benin",
    BM: "Bermuda",
    BT: "Bhutan",
    BO: "Bolivia",
    BA: "Bosnia and Herzegovina",
    BW: "Botswana",
    BV: "Bouvet Island",
    BR: "Brazil",
    IO: "British Indian Ocean Territory",
    BN: "Brunei Darussalam",
    BG: "Bulgaria",
    BF: "Burkina Faso",
    BI: "Burundi",
    KH: "Cambodia",
    CM: "Cameroon",
    CA: "Canada",
    CV: "Cape Verde",
    KY: "Cayman Islands",
    CF: "Central African Republic",
    TD: "Chad",
    CL: "Chile",
    CN: "China",
    CX: "Christmas Island",
    CC: "Cocos (Keeling) Islands",
    CO: "Colombia",
    KM: "Comoros",
    CG: "Congo",
    CD: "Congo, The Democratic Republic of the",
    CK: "Cook Islands",
    CR: "Costa Rica",
    CI: "Cote D'Ivoire",
    HR: "Croatia",
    CU: "Cuba",
    CY: "Cyprus",
    CZ: "Czech Republic",
    DK: "Denmark",
    DJ: "Djibouti",
    DM: "Dominica",
    DO: "Dominican Republic",
    EC: "Ecuador",
    EG: "Egypt",
    SV: "El Salvador",
    GQ: "Equatorial Guinea",
    ER: "Eritrea",
    EE: "Estonia",
    ET: "Ethiopia",
    FK: "Falkland Islands (Malvinas)",
    FO: "Faroe Islands",
    FJ: "Fiji",
    FI: "Finland",
    FR: "France",
    GF: "French Guiana",
    PF: "French Polynesia",
    TF: "French Southern Territories",
    GA: "Gabon",
    GM: "Gambia",
    GE: "Georgia",
    DE: "Germany",
    GH: "Ghana",
    GI: "Gibraltar",
    GR: "Greece",
    GL: "Greenland",
    GD: "Grenada",
    GP: "Guadeloupe",
    GU: "Guam",
    GT: "Guatemala",
    GG: "Guernsey",
    GN: "Guinea",
    GW: "Guinea-Bissau",
    GY: "Guyana",
    HT: "Haiti",
    HM: "Heard Island and Mcdonald Islands",
    VA: "Holy See (Vatican City State)",
    HN: "Honduras",
    HK: "Hong Kong",
    HU: "Hungary",
    IS: "Iceland",
    IN: "India",
    ID: "Indonesia",
    IR: "Iran, Islamic Republic Of",
    IQ: "Iraq",
    IE: "Ireland",
    IM: "Isle of Man",
    IL: "Israel",
    IT: "Italy",
    JM: "Jamaica",
    JP: "Japan",
    JE: "Jersey",
    JO: "Jordan",
    KZ: "Kazakhstan",
    KE: "Kenya",
    KI: "Kiribati",
    KP: "Korea, Democratic People'S Republic of",
    KR: "Korea, Republic of",
    KW: "Kuwait",
    KG: "Kyrgyzstan",
    LA: "Lao People'S Democratic Republic",
    LV: "Latvia",
    LB: "Lebanon",
    LS: "Lesotho",
    LR: "Liberia",
    LY: "Libyan Arab Jamahiriya",
    LI: "Liechtenstein",
    LT: "Lithuania",
    LU: "Luxembourg",
    MO: "Macao",
    MK: "Macedonia, The Former Yugoslav Republic of",
    MG: "Madagascar",
    MW: "Malawi",
    MY: "Malaysia",
    MV: "Maldives",
    ML: "Mali",
    MT: "Malta",
    MH: "Marshall Islands",
    MQ: "Martinique",
    MR: "Mauritania",
    MU: "Mauritius",
    YT: "Mayotte",
    MX: "Mexico",
    FM: "Micronesia, Federated States of",
    MD: "Moldova, Republic of",
    MC: "Monaco",
    MN: "Mongolia",
    MS: "Montserrat",
    MA: "Morocco",
    MZ: "Mozambique",
    MM: "Myanmar",
    NA: "Namibia",
    NR: "Nauru",
    NP: "Nepal",
    NL: "Netherlands",
    AN: "Netherlands Antilles",
    NC: "New Caledonia",
    NZ: "New Zealand",
    NI: "Nicaragua",
    NE: "Niger",
    NG: "Nigeria",
    NU: "Niue",
    NF: "Norfolk Island",
    MP: "Northern Mariana Islands",
    NO: "Norway",
    OM: "Oman",
    PK: "Pakistan",
    PW: "Palau",
    PS: "Palestinian Territory, Occupied",
    PA: "Panama",
    PG: "Papua New Guinea",
    PY: "Paraguay",
    PE: "Peru",
    PH: "Philippines",
    PN: "Pitcairn",
    PL: "Poland",
    PT: "Portugal",
    PR: "Puerto Rico",
    QA: "Qatar",
    RE: "Reunion",
    RO: "Romania",
    RU: "Russian Federation",
    RW: "Rwanda",
    SH: "Saint Helena",
    KN: "Saint Kitts and Nevis",
    LC: "Saint Lucia",
    PM: "Saint Pierre and Miquelon",
    VC: "Saint Vincent and the Grenadines",
    WS: "Samoa",
    SM: "San Marino",
    ST: "Sao Tome and Principe",
    SA: "Saudi Arabia",
    SN: "Senegal",
    CS: "Serbia and Montenegro",
    SC: "Seychelles",
    SL: "Sierra Leone",
    SG: "Singapore",
    SK: "Slovakia",
    SI: "Slovenia",
    SB: "Solomon Islands",
    SO: "Somalia",
    ZA: "South Africa",
    GS: "South Georgia and the South Sandwich Islands",
    ES: "Spain",
    LK: "Sri Lanka",
    SD: "Sudan",
    SR: "Suriname",
    SJ: "Svalbard and Jan Mayen",
    SZ: "Swaziland",
    SE: "Sweden",
    CH: "Switzerland",
    SY: "Syrian Arab Republic",
    TW: "Taiwan, Province of China",
    TJ: "Tajikistan",
    TZ: "Tanzania, United Republic of",
    TH: "Thailand",
    TL: "Timor-Leste",
    TG: "Togo",
    TK: "Tokelau",
    TO: "Tonga",
    TT: "Trinidad and Tobago",
    TN: "Tunisia",
    TR: "Turkey",
    TM: "Turkmenistan",
    TC: "Turks and Caicos Islands",
    TV: "Tuvalu",
    UG: "Uganda",
    UA: "Ukraine",
    AE: "United Arab Emirates",
    GB: "United Kingdom",
    US: "United States",
    UM: "United States Minor Outlying Islands",
    UY: "Uruguay",
    UZ: "Uzbekistan",
    VU: "Vanuatu",
    VE: "Venezuela",
    VN: "Viet Nam",
    VG: "Virgin Islands, British",
    VI: "Virgin Islands, U.S.",
    WF: "Wallis and Futuna",
    EH: "Western Sahara",
    YE: "Yemen",
    ZM: "Zambia",
    ZW: "Zimbabwe",
    Unknown: "Unknown",
  };

  function updateDashboardSettings() {
    settings = window.__SKOPOS_SETTINGS__;
    try {
      const stored = localStorage.getItem("skopos-settings");
      if (stored) {
        settings = { ...settings, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.error("Failed to parse settings:", e);
    }

    if (dataPeriodLabel) {
      dataPeriodLabel.textContent = `Displaying data for the last ${settings.dataPeriod} days`;
    }

    fetchDashboardData(WEBSITE_ID);
    setupRefreshInterval();
  }

  function setupRefreshInterval() {
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
    if (!settings.autoRefresh || !WEBSITE_ID) {
      if (progressBar) {
        progressBar.style.transition = "none";
        progressBar.style.width = "0%";
      }
      return;
    }
    animateProgressBar(settings.refreshRate);
    refreshInterval = setInterval(() => {
      fetchDashboardData(WEBSITE_ID);
      animateProgressBar(settings.refreshRate);
    }, settings.refreshRate);
  }

  function openDetailDrawer(reportType, reportTitle) {
    const drawerTitle = document.getElementById("detail-drawer-title");
    drawerTitle.textContent = reportTitle;
    detailDrawerOverlay.classList.add("active");
    detailDrawer.classList.add("active");
    detailDrawer.dataset.reportType = reportType;
    fetchDetailedData(reportType);
  }

  function closeDetailDrawer() {
    detailDrawerOverlay.classList.remove("active");
    detailDrawer.classList.remove("active");
  }

  if (detailDrawerClose) {
    detailDrawerClose.addEventListener("click", closeDetailDrawer);
  }

  if (detailDrawerOverlay) {
    detailDrawerOverlay.addEventListener("click", closeDetailDrawer);
  }

  if (manualRefreshBtn) {
    manualRefreshBtn.addEventListener("click", () => {
      if (WEBSITE_ID) {
        fetchDashboardData(WEBSITE_ID);
        if (settings.autoRefresh) {
          setupRefreshInterval();
        }
      }
    });
  }

  const reportCards = document.querySelectorAll(".report-card");
  for (const card of reportCards) {
    card.addEventListener("click", () => {
      const reportType = card.dataset.reportType;
      const reportTitle = card.dataset.reportTitle;
      if (reportType && reportTitle) {
        openDetailDrawer(reportType, reportTitle);
      }
    });
  }

  function getThemeColors() {
    const computedStyle = getComputedStyle(document.documentElement);
    return {
      primary: computedStyle.getPropertyValue("--primary-color").trim(),
      textSecondary: computedStyle.getPropertyValue("--text-secondary").trim(),
      borderColor: computedStyle.getPropertyValue("--border-color").trim(),
      surface: computedStyle.getPropertyValue("--surface-color").trim(),
      background: computedStyle.getPropertyValue("--background-color").trim(),
      mapScaleMin: computedStyle.getPropertyValue("--map-scale-min").trim(),
      mapScaleMax: computedStyle.getPropertyValue("--map-scale-max").trim(),
    };
  }

  function updateChartTheme() {
    if (!lineChart) return;
    const colors = getThemeColors();
    lineChart.updateOptions({
      xaxis: { labels: { style: { colors: colors.textSecondary } } },
      yaxis: { labels: { style: { colors: colors.textSecondary } } },
      grid: { borderColor: colors.borderColor },
      colors: [colors.primary],
      noData: { style: { color: colors.textSecondary } },
    });
  }

  function initializeLineChart(initialData) {
    const chartElement = document.getElementById("analytics-chart");
    if (!chartElement) return;

    const hasData = initialData.length > 0 && initialData[0].data.some((point) => point[1] > 0);
    const colors = getThemeColors();
    const options = {
      series: hasData ? initialData : [],
      chart: {
        height: 350,
        type: "area",
        toolbar: { show: false },
        zoom: { enabled: false },
        animations: { enabled: true, easing: "easeinout", speed: 800 },
      },
      dataLabels: { enabled: false },
      stroke: { curve: "smooth", width: 2 },
      xaxis: { type: "datetime", labels: { style: { colors: colors.textSecondary } } },
      yaxis: { labels: { style: { colors: colors.textSecondary } } },
      tooltip: { x: { format: "dd MMM yyyy" } },
      grid: { borderColor: colors.borderColor },
      fill: {
        type: "gradient",
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.7,
          opacityTo: 0.2,
          stops: [0, 90, 100],
        },
      },
      colors: [colors.primary],
      noData: {
        text: "No page view data available for this period.",
        align: "center",
        verticalAlign: "middle",
        offsetX: 0,
        offsetY: 0,
        style: { color: colors.textSecondary, fontSize: "14px" },
      },
    };
    if (lineChart) lineChart.destroy();
    lineChart = new ApexCharts(chartElement, options);
    lineChart.render();
  }

  function initializeWorldMap(countryData) {
    const mapElement = document.getElementById("world-map");
    if (!mapElement) return;

    const colors = getThemeColors();
    const mapValues = countryData.reduce((acc, item) => {
      acc[item.key] = item.count;
      return acc;
    }, {});

    if (worldMap) {
      worldMap.destroy();
    }

    worldMap = new jsVectorMap({
      selector: "#world-map",
      map: "world",
      backgroundColor: "transparent",
      zoomButtons: false,
      regionStyle: {
        initial: { fill: colors.borderColor },
        hover: { fill: colors.primary },
      },
      series: {
        regions: [
          {
            values: mapValues,
            scale: [colors.mapScaleMin, colors.mapScaleMax],
            normalizeFunction: "polynomial",
          },
        ],
      },
      onRegionTooltipShow(event, tooltip, code) {
        const countryName = countryNames[code] || code;
        const visitorCount = mapValues[code] || 0;
        tooltip.text(`${countryName}: ${visitorCount} visitors`);
      },
    });
  }

  if (typeof initialChartData !== "undefined") {
    initializeLineChart(initialChartData);
  }

  if (typeof initialReportData !== "undefined" && initialReportData.countryBreakdown) {
    initializeWorldMap(initialReportData.countryBreakdown);
  }

  function updateMetricCard(metricId, value, change) {
    const valueElement = document.getElementById(`${metricId}-value`);
    const changeElement = document.getElementById(`${metricId}-change`);
    if (valueElement) valueElement.textContent = value;
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
    let html = '<div class="report-table-header"><span>Item</span><span>Views</span></div><ul class="report-table-list">';
    for (const item of data) {
      html += `<li><div class="list-item-info"><span class="list-item-key">${countryNames[item.key] || item.key}</span><span class="list-item-count">${item.count}</span></div><div class="progress-bar-container"><div class="progress-bar" style="width: ${item.percentage}%"></div></div></li>`;
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
      updateMetricCard("engagementrate", `${data.metrics.engagementRate}%`, data.metrics.change.engagementRate);
      updateMetricCard("avgsession", data.metrics.avgSessionDuration.formatted, data.metrics.change.avgSessionDuration);
    }
    if (data.reports) {
      updateReportCard("report-top-pages", data.reports.topPages);
      updateReportCard("report-entry-pages", data.reports.entryPages);
      updateReportCard("report-exit-pages", data.reports.exitPages);
      updateReportCard("report-top-referrers", data.reports.topReferrers);
      updateReportCard("report-custom-events", data.reports.topCustomEvents);
      updateReportCard("report-devices", data.reports.deviceBreakdown);
      updateReportCard("report-browsers", data.reports.browserBreakdown);
      updateReportCard("report-languages", data.reports.languageBreakdown);
      updateReportCard("report-countries", data.reports.countryBreakdown);
      updateReportCard("report-utm-source", data.reports.utmSourceBreakdown);
      updateReportCard("report-utm-medium", data.reports.utmMediumBreakdown);
      updateReportCard("report-utm-campaign", data.reports.utmCampaignBreakdown);
      if (worldMap && data.reports.countryBreakdown) {
        const mapValues = data.reports.countryBreakdown.reduce((acc, item) => {
          acc[item.key] = item.count;
          return acc;
        }, {});
        worldMap.series.regions[0].setValues(mapValues);
      }
    }
    if (data.chartData && lineChart) {
      const hasData = data.chartData.length > 0 && data.chartData[0].data.some((point) => point[1] > 0);
      lineChart.updateSeries(hasData ? data.chartData : []);
    }
  }

  async function fetchDashboardData(websiteId) {
    try {
      const url = `/dashboard/data/${websiteId}?period=${settings.dataPeriod}&limit=${settings.resultsLimit}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      processUpdate(data);
    } catch (error) {
      console.error("[Dashboard ERROR] Failed to fetch dashboard data:", error);
    }
  }

  async function fetchDetailedData(reportType) {
    const tableContainer = document.getElementById("detail-table-container");
    tableContainer.innerHTML = '<div class="spinner-container" style="opacity: 1; visibility: visible;"><div class="spinner"></div></div>';
    try {
      const url = `/dashboard/report/${WEBSITE_ID}/${reportType}?period=${settings.dataPeriod}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      renderDetailTable(result.data);
    } catch (error) {
      console.error("[Detail Drawer ERROR] Failed to fetch detailed data:", error);
      tableContainer.innerHTML = '<div class="no-data-message">Failed to load data.</div>';
    }
  }

  let detailTableData = [];
  let filteredData = [];
  let currentPage = 1;
  const itemsPerPage = 20;
  let sortColumn = "count";
  let sortDirection = "desc";

  function renderDetailTable(data) {
    detailTableData = data;
    filteredData = [...data];
    currentPage = 1;
    applySort();
    updateTable();
  }

  function applySort() {
    filteredData.sort((a, b) => {
      let aVal = a[sortColumn];
      let bVal = b[sortColumn];
      if (sortColumn === "key") {
        aVal = (countryNames[aVal] || aVal).toLowerCase();
        bVal = (countryNames[bVal] || bVal).toLowerCase();
        return sortDirection === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
    });
  }

  function applySearch(query) {
    filteredData = query ? detailTableData.filter((item) => (countryNames[item.key] || item.key).toLowerCase().includes(query.toLowerCase())) : [...detailTableData];
    currentPage = 1;
    applySort();
    updateTable();
  }

  function updateTable() {
    const tableContainer = document.getElementById("detail-table-container");
    const paginationInfo = document.getElementById("detail-pagination-info");
    const paginationControls = document.getElementById("detail-pagination-controls");
    if (filteredData.length === 0) {
      tableContainer.innerHTML = '<div class="no-data-message">No data available.</div>';
      paginationInfo.textContent = "";
      paginationControls.innerHTML = "";
      return;
    }
    const totalPages = Math.ceil(filteredData.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, filteredData.length);
    const pageData = filteredData.slice(startIndex, endIndex);
    let tableHTML = `<table class="detail-table"><thead><tr><th data-column="key">Item ${sortColumn === "key" ? (sortDirection === "asc" ? '<i class="fa-solid fa-sort-up"></i>' : '<i class="fa-solid fa-sort-down"></i>') : '<i class="fa-solid fa-sort"></i>'}</th><th data-column="count">Count ${sortColumn === "count" ? (sortDirection === "asc" ? '<i class="fa-solid fa-sort-up"></i>' : '<i class="fa-solid fa-sort-down"></i>') : '<i class="fa-solid fa-sort"></i>'}</th><th data-column="percentage">Percentage ${sortColumn === "percentage" ? (sortDirection === "asc" ? '<i class="fa-solid fa-sort-up"></i>' : '<i class="fa-solid fa-sort-down"></i>') : '<i class="fa-solid fa-sort"></i>'}</th></tr></thead><tbody>`;
    for (const item of pageData) {
      tableHTML += `<tr><td>${countryNames[item.key] || item.key}</td><td>${item.count}</td><td>${item.percentage}%</td></tr>`;
    }
    tableHTML += "</tbody></table>";
    tableContainer.innerHTML = tableHTML;
    const headers = tableContainer.querySelectorAll("th[data-column]");
    for (const header of headers) {
      header.addEventListener("click", () => {
        const column = header.dataset.column;
        if (sortColumn === column) {
          sortDirection = sortDirection === "asc" ? "desc" : "asc";
        } else {
          sortColumn = column;
          sortDirection = "desc";
        }
        applySort();
        updateTable();
      });
    }
    paginationInfo.textContent = `Showing ${startIndex + 1}-${endIndex} of ${filteredData.length}`;
    let paginationHTML = currentPage > 1 ? `<button class="detail-pagination-btn" data-page="${currentPage - 1}"><i class="fa-solid fa-chevron-left"></i></button>` : `<button class="detail-pagination-btn" disabled><i class="fa-solid fa-chevron-left"></i></button>`;
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);
    for (let i = startPage; i <= endPage; i++) {
      paginationHTML += `<button class="detail-pagination-btn ${i === currentPage ? "active" : ""}" data-page="${i}">${i}</button>`;
    }
    paginationHTML += currentPage < totalPages ? `<button class="detail-pagination-btn" data-page="${currentPage + 1}"><i class="fa-solid fa-chevron-right"></i></button>` : `<button class="detail-pagination-btn" disabled><i class="fa-solid fa-chevron-right"></i></button>`;
    paginationControls.innerHTML = paginationHTML;
    const paginationButtons = paginationControls.querySelectorAll(".detail-pagination-btn[data-page]");
    for (const button of paginationButtons) {
      button.addEventListener("click", () => {
        currentPage = Number.parseInt(button.dataset.page);
        updateTable();
      });
    }
  }

  const detailSearch = document.getElementById("detail-drawer-search");
  if (detailSearch) {
    detailSearch.addEventListener("input", (e) => applySearch(e.target.value));
  }

  function animateProgressBar(duration) {
    if (!progressBar) return;
    progressBar.style.transition = "none";
    progressBar.style.width = "100%";
    progressBar.offsetHeight;
    progressBar.style.transition = `width ${duration}ms linear`;
    progressBar.style.width = "0%";
  }

  window.addEventListener("load", () => {
    const loadingCards = document.querySelectorAll(".loading");
    for (const card of loadingCards) {
      card.classList.remove("loading");
    }
  });

  window.addEventListener("settingsChanged", updateDashboardSettings);
  window.addEventListener("themeChanged", () => {
    updateChartTheme();
    if (worldMap && initialReportData.countryBreakdown) {
      initializeWorldMap(initialReportData.countryBreakdown);
    }
  });

  if (WEBSITE_ID) {
    updateDashboardSettings();
  }
});
