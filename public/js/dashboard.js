document.addEventListener("DOMContentLoaded", () => {
  const pageWrapper = document.querySelector(".page-wrapper");
  const WEBSITE_ID = pageWrapper ? pageWrapper.dataset.websiteId : null;
  const IS_ARCHIVED = pageWrapper ? pageWrapper.dataset.isArchived === "true" : false;
  const progressBar = document.getElementById("update-progress-bar");
  const detailDrawerOverlay = document.getElementById("detail-drawer-overlay");
  const detailDrawer = document.getElementById("detail-drawer");
  const detailDrawerClose = document.getElementById("detail-drawer-close");
  const itemDetailDrawer = document.getElementById("item-detail-drawer");
  const itemDetailDrawerClose = document.getElementById("item-detail-drawer-close");
  const manualRefreshBtn = document.getElementById("manual-refresh-btn");
  const dataPeriodLabel = document.getElementById("data-period-label");
  const dataRetentionInput = document.getElementById("data-retention-input");

  const websiteSettingsBtn = document.getElementById("website-settings-btn");
  const websiteSettingsDrawer = document.getElementById("website-settings-drawer");
  const websiteSettingsClose = document.getElementById("website-settings-close");
  const ipBlacklistBtn = document.getElementById("manage-ip-blacklist-btn");
  const ipBlacklistDrawer = document.getElementById("ip-blacklist-drawer");
  const ipBlacklistClose = document.getElementById("ip-blacklist-close");
  const disableLocalhostToggle = document.getElementById("disable-localhost-toggle");
  const addIpForm = document.getElementById("add-ip-form");
  const ipAddressInput = document.getElementById("ip-address-input");
  const ipBlacklistTableBody = document.getElementById("ip-blacklist-table-body");
  const userIpAddressEl = document.getElementById("user-ip-address");
  const addUserIpBtn = document.getElementById("add-user-ip-btn");
  const removeUserIpBtn = document.getElementById("remove-user-ip-btn");

  let settings = window.__SKOPOS_SETTINGS__;
  let userCurrentIp = null;
  let refreshInterval = null;
  let worldMap = null;
  let eventSource = null;
  const metricCharts = {};
  let currentCountryData = [];

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

    if (IS_ARCHIVED) return;
    fetchDashboardData();
    setupRefreshInterval();
  }

  function setupRefreshInterval() {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }

    if (progressBar) {
      progressBar.style.transition = "none";
      progressBar.style.width = "0%";
    }

    if (IS_ARCHIVED) return;

    if (settings.refreshRate === 0) {
      if (progressBar) {
        progressBar.style.width = "100%";
      }
      eventSource = new EventSource("/dashboard/events");
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "update") {
          if (!WEBSITE_ID || data.websiteId === WEBSITE_ID) {
            fetchDashboardData();
          }
        }
      };
      eventSource.onerror = (err) => {
        console.error("EventSource failed:", err);
        eventSource.close();
      };
      return;
    }

    if (settings.autoRefresh) {
      animateProgressBar(settings.refreshRate);
      refreshInterval = setInterval(() => {
        fetchDashboardData();
        animateProgressBar(settings.refreshRate);
      }, settings.refreshRate);
    }
  }

  function openDetailDrawer(reportType, reportTitle) {
    const drawerTitle = document.getElementById("detail-drawer-title");
    drawerTitle.textContent = reportTitle;
    detailDrawerOverlay.classList.add("active");
    detailDrawer.classList.add("active");
    detailDrawer.dataset.reportType = reportType;
    fetchDetailedData(reportType);
  }

  function openItemDetailDrawer(title, content) {
    const drawerTitle = document.getElementById("item-detail-drawer-title");
    const drawerContent = document.getElementById("item-detail-content");

    drawerTitle.textContent = title;
    drawerContent.innerHTML = content;

    detailDrawerOverlay.classList.add("active");
    itemDetailDrawer.classList.add("active");
  }

  if (detailDrawerClose) {
    detailDrawerClose.addEventListener("click", () => {
      detailDrawer.classList.remove("active");
      if (!itemDetailDrawer.classList.contains("active")) {
        detailDrawerOverlay.classList.remove("active");
      }
    });
  }

  if (itemDetailDrawerClose) {
    itemDetailDrawerClose.addEventListener("click", () => {
      itemDetailDrawer.classList.remove("active");
      if (!detailDrawer.classList.contains("active")) {
        detailDrawerOverlay.classList.remove("active");
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
      } else if (itemDetailDrawer?.classList.contains("active")) {
        topDrawer = itemDetailDrawer;
      } else if (detailDrawer?.classList.contains("active")) {
        topDrawer = detailDrawer;
      } else if (websiteSettingsDrawer?.classList.contains("active")) {
        topDrawer = websiteSettingsDrawer;
      }

      if (topDrawer) {
        topDrawer.classList.remove("active");
      }

      const remainingActiveDrawers = document.querySelectorAll(".drawer.active");
      if (remainingActiveDrawers.length === 0) {
        detailDrawerOverlay.classList.remove("active");
      }
    });
  }

  if (manualRefreshBtn) {
    manualRefreshBtn.addEventListener("click", () => {
      if (IS_ARCHIVED) return;
      fetchDashboardData();
      if (settings.autoRefresh) {
        setupRefreshInterval();
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
      chartTooltipBg: computedStyle.getPropertyValue("--surface-color").trim(),
      chartTooltipColor: computedStyle.getPropertyValue("--text-primary").trim(),
      chartTooltipBorder: computedStyle.getPropertyValue("--border-color").trim(),
    };
  }

  function updateChartTheme() {
    if (Object.keys(metricCharts).length === 0) return;
    const colors = getThemeColors();
    for (const key in metricCharts) {
      metricCharts[key].updateOptions({
        stroke: { colors: [colors.primary] },
      });
    }
    if (worldMap) {
      initializeWorldMap(currentCountryData);
    }
  }

  function createMiniChart(elementId, data, color) {
    const options = {
      series: [{ data: data }],
      chart: {
        type: "line",
        height: 40,
        width: 120,
        sparkline: { enabled: true },
        animations: { enabled: false },
      },
      stroke: { curve: "smooth", width: 2, colors: [color] },
      tooltip: { enabled: false },
    };
    const chart = new ApexCharts(document.getElementById(elementId), options);
    chart.render();
    return chart;
  }

  function initializeMetricCharts(metrics) {
    if (!metrics || !metrics.trends) return;
    const colors = getThemeColors();
    metricCharts.pageviews = createMiniChart("pageviews-trend-chart", metrics.trends.pageViews, colors.primary);
    metricCharts.visitors = createMiniChart("visitors-trend-chart", metrics.trends.visitors, colors.primary);
    metricCharts.engagementrate = createMiniChart("engagementrate-trend-chart", metrics.trends.engagementRate, colors.primary);
    metricCharts.avgsession = createMiniChart("avgsession-trend-chart", metrics.trends.avgSessionDuration, colors.primary);
  }

  function initializeWorldMap(countryData) {
    const mapElement = document.getElementById("world-map");
    if (!mapElement) return;

    currentCountryData = countryData;

    const colors = getThemeColors();
    const regionInitialFill = colors.borderColor;
    const regionHoverFill = colors.primary;
    const minScale = colors.mapScaleMin;
    const maxScale = colors.mapScaleMax;

    const mapValues = {};
    for (const item of countryData) {
      mapValues[item.key] = item.count;
    }

    if (worldMap) {
      worldMap.destroy();
      worldMap = null;
    }
    mapElement.innerHTML = "";

    worldMap = new jsVectorMap({
      selector: "#world-map",
      map: "world",
      backgroundColor: "transparent",
      zoomButtons: false,
      regionStyle: {
        initial: { fill: regionInitialFill },
        hover: { fill: regionHoverFill },
      },
      series: {
        regions: [
          {
            values: mapValues,
            scale: [minScale, maxScale],
            normalizeFunction: "linear",
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

  if (typeof initialMetrics !== "undefined") {
    initializeMetricCharts(initialMetrics);
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
    let html = '<div class="report-table-header"><span>Item</span><span>Count</span></div><ul class="report-table-list">';
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

      if (data.metrics.trends) {
        metricCharts.pageviews?.updateSeries([{ data: data.metrics.trends.pageViews }]);
        metricCharts.visitors?.updateSeries([{ data: data.metrics.trends.visitors }]);
        metricCharts.engagementrate?.updateSeries([{ data: data.metrics.trends.engagementRate }]);
        metricCharts.avgsession?.updateSeries([{ data: data.metrics.trends.avgSessionDuration }]);
      }
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
      updateReportCard("report-js-errors", data.reports.topJsErrors);
      if (worldMap && data.reports.countryBreakdown) {
        currentCountryData = data.reports.countryBreakdown;
        const mapValues = {};
        for (const item of data.reports.countryBreakdown) {
          mapValues[item.key] = item.count;
        }
        worldMap.series.regions[0].setValues(mapValues);
      }
    }
  }

  async function fetchDashboardData() {
    if (IS_ARCHIVED) return;
    try {
      const endpoint = WEBSITE_ID ? `/dashboard/data/${WEBSITE_ID}` : "/overview/data";
      const url = `${endpoint}?period=${settings.dataPeriod}&limit=${settings.resultsLimit}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      processUpdate(data);
    } catch (error) {
      console.error("[Dashboard ERROR] Failed to fetch dashboard data:", error);
    }
  }

  async function fetchDetailedData(reportType) {
    if (!WEBSITE_ID) return;
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

  function formatObjectToHtml(obj) {
    if (obj === null) return "<span>null</span>";
    if (typeof obj !== "object") {
      return `<span>${typeof obj === "string" ? `"${obj}"` : obj}</span>`;
    }

    let html = "<ul>";
    if (Array.isArray(obj)) {
      for (const item of obj) {
        html += `<li>${formatObjectToHtml(item)}</li>`;
      }
    } else {
      for (const key of Object.keys(obj)) {
        html += `<li><strong>${key}:</strong> ${formatObjectToHtml(obj[key])}</li>`;
      }
    }
    html += "</ul>";
    return html;
  }

  function formatJsonForDisplay(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      return formatObjectToHtml(data);
    } catch (e) {
      return `<pre>${jsonString}</pre>`;
    }
  }

  async function fetchCustomEventDetails(eventName) {
    if (!WEBSITE_ID) return;
    const loadingHTML = '<div class="spinner-container" style="opacity: 1; visibility: visible; position: relative;"><div class="spinner"></div></div>';
    openItemDetailDrawer(`Details for: ${eventName}`, loadingHTML);

    try {
      const url = `/dashboard/report/${WEBSITE_ID}/custom-event-details?name=${encodeURIComponent(eventName)}&period=${settings.dataPeriod}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();

      let content = "";
      if (result.data && result.data.length > 0) {
        content = result.data.map((d) => `<div class="detail-item-content">${formatJsonForDisplay(d)}</div>`).join("");
      } else {
        content = "<p>No additional data for this event.</p>";
      }

      const drawerContent = document.getElementById("item-detail-content");
      drawerContent.innerHTML = content;
    } catch (error) {
      console.error("[Detail Drawer ERROR] Failed to fetch custom event details:", error);
      const drawerContent = document.getElementById("item-detail-content");
      drawerContent.innerHTML = '<div class="no-data-message">Failed to load event data.</div>';
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
    const reportType = detailDrawer.dataset.reportType;
    const isErrorLog = reportType === "topJsErrors";
    const isCustomEvents = reportType === "topCustomEvents";

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
      const isClickable = isErrorLog || (isCustomEvents && item.hasData);
      const rowClass = isClickable ? "clickable" : "";
      const dataAttr = isErrorLog ? `data-stacktrace="${item.stackTrace.replace(/"/g, "&quot;")}"` : "";
      const eventNameAttr = isCustomEvents ? `data-event-name="${item.key}"` : "";
      const keyDisplay = countryNames[item.key] || item.key;
      const icon = isCustomEvents && item.hasData ? ' <i class="fa-solid fa-circle-info"></i>' : "";
      tableHTML += `<tr class="${rowClass}" ${dataAttr} ${eventNameAttr}><td>${keyDisplay}${icon}</td><td>${item.count}</td><td>${item.percentage}%</td></tr>`;
    }
    tableHTML += "</tbody></table>";
    tableContainer.innerHTML = tableHTML;

    const rows = tableContainer.querySelectorAll("tbody tr.clickable");
    for (const row of rows) {
      row.addEventListener("click", () => {
        if (isErrorLog) {
          const stackTrace = row.dataset.stacktrace;
          const errorMessage = row.cells[0].textContent;
          const content = `<pre class="detail-item-content pre-formatted">${stackTrace || "No stack trace available."}</pre>`;
          openItemDetailDrawer(errorMessage, content);
        }
        if (isCustomEvents) {
          const eventName = row.dataset.eventName;
          fetchCustomEventDetails(eventName);
        }
      });
    }

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

  async function updateWebsiteSetting(payload) {
    if (!WEBSITE_ID) return;
    try {
      const response = await fetch(`/dashboard/settings/${WEBSITE_ID}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error("Failed to update setting");
      }
    } catch (error) {
      console.error("Error updating website setting:", error);
    }
  }

  if (websiteSettingsBtn) {
    websiteSettingsBtn.addEventListener("click", () => {
      detailDrawerOverlay.classList.add("active");
      websiteSettingsDrawer.classList.add("active");
    });
  }

  if (websiteSettingsClose) {
    websiteSettingsClose.addEventListener("click", () => {
      websiteSettingsDrawer.classList.remove("active");
      if (!ipBlacklistDrawer.classList.contains("active")) {
        detailDrawerOverlay.classList.remove("active");
      }
    });
  }

  if (ipBlacklistBtn) {
    ipBlacklistBtn.addEventListener("click", () => {
      ipBlacklistDrawer.classList.add("active");
      fetchAndRenderIpBlacklist();
    });
  }

  if (ipBlacklistClose) {
    ipBlacklistClose.addEventListener("click", () => {
      ipBlacklistDrawer.classList.remove("active");
    });
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
        dataRetentionDays: e.target.value,
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
    if (!WEBSITE_ID) return;

    if (!userCurrentIp) {
      await fetchUserIp();
    }

    try {
      const response = await fetch(`/dashboard/settings/${WEBSITE_ID}`);
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
      ipBlacklistTableBody.innerHTML = '<tr><td colspan="2">Failed to load IPs.</td></tr>';
    }
  }

  if (addIpForm) {
    addIpForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const ip = ipAddressInput.value.trim();
      if (!ip || !WEBSITE_ID) return;

      try {
        const response = await fetch(`/dashboard/blacklist/${WEBSITE_ID}/add`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ip }),
        });
        if (response.ok) {
          ipAddressInput.value = "";
          fetchAndRenderIpBlacklist();
        } else {
          const errorData = await response.json();
          alert(`Error: ${errorData.error}`);
        }
      } catch (error) {
        alert("Failed to add IP address.");
      }
    });
  }

  if (addUserIpBtn) {
    addUserIpBtn.addEventListener("click", async () => {
      if (!userCurrentIp || !WEBSITE_ID) return;

      try {
        const response = await fetch(`/dashboard/blacklist/${WEBSITE_ID}/add`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ip: userCurrentIp }),
        });
        if (response.ok) {
          fetchAndRenderIpBlacklist();
        } else {
          const errorData = await response.json();
          alert(`Error: ${errorData.error}`);
        }
      } catch (error) {
        alert("Failed to add your IP address to blocklist.");
      }
    });
  }

  if (removeUserIpBtn) {
    removeUserIpBtn.addEventListener("click", async () => {
      if (!userCurrentIp || !WEBSITE_ID) return;

      try {
        const response = await fetch(`/dashboard/blacklist/${WEBSITE_ID}/remove`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ip: userCurrentIp }),
        });
        if (response.ok) {
          fetchAndRenderIpBlacklist();
        } else {
          alert("Failed to remove your IP address from blocklist.");
        }
      } catch (error) {
        alert("Failed to remove your IP address from blocklist.");
      }
    });
  }

  if (ipBlacklistTableBody) {
    ipBlacklistTableBody.addEventListener("click", async (e) => {
      const removeBtn = e.target.closest(".remove-ip-btn");
      if (removeBtn) {
        const ip = removeBtn.dataset.ip;
        if (!WEBSITE_ID) return;
        try {
          const response = await fetch(`/dashboard/blacklist/${WEBSITE_ID}/remove`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ip }),
          });
          if (response.ok) {
            fetchAndRenderIpBlacklist();
          } else {
            alert("Failed to remove IP address.");
          }
        } catch (error) {
          alert("Failed to remove IP address.");
        }
      }
    });
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
  });

  if (IS_ARCHIVED) {
    if (manualRefreshBtn) manualRefreshBtn.disabled = true;
    if (websiteSettingsBtn) websiteSettingsBtn.disabled = true;
  }

  (() => {
    updateDashboardSettings();
  })();
});
