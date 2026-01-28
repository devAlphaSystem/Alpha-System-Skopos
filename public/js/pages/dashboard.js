const INTER_FONT_STACK = '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

document.addEventListener("DOMContentLoaded", () => {
  if (window.Apex) {
    window.Apex = {
      ...window.Apex,
      chart: {
        ...(window.Apex.chart || {}),
        fontFamily: INTER_FONT_STACK,
      },
      dataLabels: {
        ...(window.Apex.dataLabels || {}),
        style: {
          ...(window.Apex.dataLabels?.style || {}),
          fontFamily: INTER_FONT_STACK,
        },
      },
      legend: {
        ...(window.Apex.legend || {}),
        fontFamily: INTER_FONT_STACK,
      },
      tooltip: {
        ...(window.Apex.tooltip || {}),
        style: {
          ...(window.Apex.tooltip?.style || {}),
          fontFamily: INTER_FONT_STACK,
        },
      },
    };
  }

  const pageWrapper = document.querySelector(".page-wrapper");
  const WEBSITE_ID = pageWrapper ? pageWrapper.dataset.websiteId : null;
  const IS_ARCHIVED = pageWrapper ? pageWrapper.dataset.isArchived === "true" : false;
  const progressBar = document.getElementById("update-progress-bar");
  const mobileProgressBar = document.getElementById("mobile-update-progress-bar");
  const detailDrawerOverlay = document.getElementById("detail-drawer-overlay");
  const detailDrawer = document.getElementById("detail-drawer");
  const detailDrawerClose = document.getElementById("detail-drawer-close");
  const itemDetailDrawer = document.getElementById("item-detail-drawer");
  const itemDetailDrawerClose = document.getElementById("item-detail-drawer-close");
  const manualRefreshBtn = document.getElementById("manual-refresh-btn");
  const mobileRefreshBtn = document.getElementById("mobile-refresh-btn");
  const dataPeriodLabel = document.getElementById("data-period-label");
  const dataRetentionInput = document.getElementById("data-retention-input");

  const websiteSettingsBtn = document.getElementById("website-settings-btn");
  const websiteSettingsBtnSidebar = document.getElementById("website-settings-btn-sidebar");
  const mobileSettingsBtn = document.getElementById("mobile-settings-btn");
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
  const websiteSelector = document.getElementById("website-selector");

  let settings = window.__SKOPOS_SETTINGS__;

  const urlParams = new URLSearchParams(window.location.search);
  const urlPeriod = urlParams.get("period");
  if (urlPeriod) {
    const periodValue = Number.parseInt(urlPeriod);
    if (!Number.isNaN(periodValue) && periodValue > 0) {
      settings.dataPeriod = periodValue;
      try {
        const stored = localStorage.getItem("skopos-settings");
        const storedSettings = stored ? JSON.parse(stored) : {};
        storedSettings.dataPeriod = periodValue;
        localStorage.setItem("skopos-settings", JSON.stringify(storedSettings));
      } catch (e) {
        console.error("Failed to save period to localStorage:", e);
      }
    }
  }

  let userCurrentIp = null;
  let refreshInterval = null;
  let worldMap = null;
  let eventSource = null;
  const metricCharts = {};
  let currentCountryData = [];

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function getBreadcrumbIcon(type) {
    const icons = {
      navigation: "fa-route",
      click: "fa-mouse-pointer",
      input: "fa-keyboard",
      custom: "fa-bolt",
      console: "fa-terminal",
      network: "fa-wifi",
    };
    return icons[type] || "fa-circle";
  }

  function getBreadcrumbClass(type) {
    const classes = {
      navigation: "breadcrumb-navigation",
      click: "breadcrumb-click",
      input: "breadcrumb-input",
      custom: "breadcrumb-custom",
      console: "breadcrumb-console",
      network: "breadcrumb-network",
    };
    return classes[type] || "breadcrumb-default";
  }

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

  const countryCodes = {};
  for (const [code, name] of Object.entries(countryNames)) {
    countryCodes[name] = code;
    countryCodes[name.toLowerCase()] = code;
  }

  const languageDisplayNameResolver = new Intl.DisplayNames(["en"], { type: "language" });

  function getCountryCode(countryKeyOrName) {
    if (countryKeyOrName && countryKeyOrName.length === 2 && countryNames[countryKeyOrName.toUpperCase()]) {
      return countryKeyOrName.toUpperCase();
    }
    return countryCodes[countryKeyOrName] || countryCodes[countryKeyOrName?.toLowerCase()] || null;
  }

  function updateDashboardSettings(skipInitialFetch = false) {
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
      const periodText = settings.dataPeriod === 1 ? "today" : `the last ${settings.dataPeriod} days`;
      dataPeriodLabel.textContent = `Displaying data for ${periodText}`;
    }

    if (IS_ARCHIVED) return;

    if (!skipInitialFetch) {
      fetchDashboardData();
    }
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
    if (mobileProgressBar) {
      mobileProgressBar.style.transition = "none";
      mobileProgressBar.style.width = "0%";
    }

    if (IS_ARCHIVED) return;

    if (settings.refreshRate === 0) {
      if (progressBar) {
        progressBar.style.width = "100%";
      }
      if (mobileProgressBar) {
        mobileProgressBar.style.width = "100%";
      }
      eventSource = new EventSource("/dashboard/events");
      eventSource.onmessage = (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch (parseErr) {
          console.warn("Ignoring non-JSON SSE payload", event.data);
          return;
        }
        const matchesWebsite = !WEBSITE_ID || !data.websiteId || data.websiteId === WEBSITE_ID;
        if (data.type === "update" && matchesWebsite) {
          fetchDashboardData();
        }
      };
      eventSource.onerror = (err) => {
        console.error("EventSource error:", err);
        if (eventSource.readyState === EventSource.CLOSED) {
          eventSource = null;
        }
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

  if (mobileRefreshBtn) {
    mobileRefreshBtn.addEventListener("click", () => {
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
        width: "100%",
        fontFamily: INTER_FONT_STACK,
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

    const isDarkTheme = document.documentElement.getAttribute("data-theme") === "dark";
    const regionInitialFill = isDarkTheme ? "#1f2937" : "#e5e7eb";
    const regionHoverFill = "#ef4444";

    const startColor = isDarkTheme ? "#374151" : "#fee2e2";
    const endColor = "#ef4444";

    function pickColor(p) {
      const c1 = startColor.match(/[A-Za-z0-9]{2}/g).map((x) => Number.parseInt(x, 16));
      const c2 = endColor.match(/[A-Za-z0-9]{2}/g).map((x) => Number.parseInt(x, 16));
      const r = [Math.round(c1[0] + (c2[0] - c1[0]) * p), Math.round(c1[1] + (c2[1] - c1[1]) * p), Math.round(c1[2] + (c2[2] - c1[2]) * p)];
      return `#${r.map((x) => x.toString(16).padStart(2, "0")).join("")}`;
    }

    const mapValues = {};
    const colorScale = {};
    const maxCount = Math.max(...countryData.map((d) => d.count), 1);

    for (const item of countryData) {
      const isoCode = getCountryCode(item.key);
      if (isoCode && item.count > 0) {
        const color = pickColor(item.count / maxCount);
        mapValues[isoCode] = color;
        colorScale[color] = color;
      }
    }

    if (worldMap) {
      worldMap.destroy();
      worldMap = null;
    }
    mapElement.innerHTML = "";

    try {
      worldMap = new jsVectorMap({
        selector: "#world-map",
        map: "world",
        backgroundColor: "transparent",
        zoomButtons: false,
        regionStyle: {
          initial: {
            fill: regionInitialFill,
            stroke: isDarkTheme ? "#374151" : "#d1d5db",
            strokeWidth: 0.5,
          },
          hover: {
            fill: regionHoverFill,
            fillOpacity: 1,
          },
        },
        series: {
          regions: [
            {
              attribute: "fill",
              values: mapValues,
              scale: colorScale,
            },
          ],
        },
        onRegionTooltipShow(event, tooltip, code) {
          const countryName = countryNames[code] || code;
          const item = currentCountryData.find((d) => getCountryCode(d.key) === code);
          const visitorCount = item ? item.count : 0;
          tooltip.text(`${countryName}: ${visitorCount} visitors`);
        },
      });
    } catch (err) {
      console.error("[Skopos Map] Initialization failed:", err);
    }
  }

  const initialMetrics = window.__INITIAL_METRICS__;
  const initialReportData = window.__INITIAL_REPORT_DATA__;

  if (typeof initialMetrics !== "undefined") {
    initializeMetricCharts(initialMetrics);

    const visitorValueEl = document.getElementById("visitors-value");
    const visitorChangeEl = document.getElementById("visitors-change");
    if (visitorValueEl && visitorChangeEl && settings.showUniqueVisitors) {
      visitorValueEl.textContent = initialMetrics.newVisitors;
      const newVisitorChange = Number.parseInt(visitorChangeEl.dataset.newVisitorsChange) || 0;
      visitorChangeEl.className = "metric-change";
      if (newVisitorChange >= 0) {
        visitorChangeEl.classList.add("positive");
        visitorChangeEl.innerHTML = `<i class="fa-solid fa-arrow-up"></i> ${newVisitorChange}%`;
      } else {
        visitorChangeEl.classList.add("negative");
        visitorChangeEl.innerHTML = `<i class="fa-solid fa-arrow-down"></i> ${Math.abs(newVisitorChange)}%`;
      }
    } else if (visitorChangeEl) {
      const visitorsChange = Number.parseInt(visitorChangeEl.dataset.visitorsChange) || 0;
      visitorChangeEl.className = "metric-change";
      if (visitorsChange >= 0) {
        visitorChangeEl.classList.add("positive");
        visitorChangeEl.innerHTML = `<i class="fa-solid fa-arrow-up"></i> ${visitorsChange}%`;
      } else {
        visitorChangeEl.classList.add("negative");
        visitorChangeEl.innerHTML = `<i class="fa-solid fa-arrow-down"></i> ${Math.abs(visitorsChange)}%`;
      }
    }
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

    const truncateText = (text, maxLength = 30) => {
      if (text.length <= maxLength) return text;
      return `${text.substring(0, maxLength)}...`;
    };

    let html = '<div class="report-table-header"><span>Item</span><span>Views</span></div><ul class="report-table-list">';
    for (const item of data) {
      let displayKey = item.key;
      if (reportId === "report-countries") {
        displayKey = countryNames[item.key] || item.key;
      } else if (reportId === "report-languages") {
        try {
          displayKey = languageDisplayNameResolver.of(item.key) || item.key;
        } catch (e) {
          displayKey = item.key;
        }
      }
      const truncatedKey = truncateText(displayKey);
      html += `<li><div class="list-item-info"><span class="list-item-key" title="${displayKey}">${truncatedKey}</span><span class="list-item-count">${item.count}</span></div><div class="progress-bar-container"><div class="progress-bar" style="width: ${item.percentage}%"></div></div></li>`;
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

      const visitorCount = settings.showUniqueVisitors ? data.metrics.newVisitors : data.metrics.visitors;
      const visitorChange = settings.showUniqueVisitors ? data.metrics.change.newVisitors : data.metrics.change.visitors;
      updateMetricCard("visitors", visitorCount, visitorChange);

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
        initializeWorldMap(data.reports.countryBreakdown);
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

  async function fetchStateBreakdown(countryCode, countryName) {
    if (!WEBSITE_ID) return;
    const loadingHTML = '<div class="spinner-container" style="opacity: 1; visibility: visible; position: relative;"><div class="spinner"></div></div>';
    openItemDetailDrawer(`States in ${countryName}`, loadingHTML);

    try {
      const url = `/dashboard/report/${WEBSITE_ID}/state-breakdown?country=${encodeURIComponent(countryCode)}&period=${settings.dataPeriod}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();

      let content = "";
      if (result.data && result.data.length > 0) {
        content = '<div class="detail-table-container"><table class="detail-table"><thead><tr><th>State</th><th>Count</th><th>Percentage</th></tr></thead><tbody>';
        for (const state of result.data) {
          content += `<tr><td>${state.key}</td><td>${state.count}</td><td>${state.percentage}%</td></tr>`;
        }
        content += "</tbody></table></div>";
      } else {
        content = "<p>No state data available for this country.</p>";
      }

      const drawerContent = document.getElementById("item-detail-content");
      drawerContent.innerHTML = content;
    } catch (error) {
      console.error("[Detail Drawer ERROR] Failed to fetch state breakdown:", error);
      const drawerContent = document.getElementById("item-detail-content");
      drawerContent.innerHTML = '<div class="no-data-message">Failed to load state data.</div>';
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
    const reportType = detailDrawer.dataset.reportType;
    filteredData.sort((a, b) => {
      let aVal = a[sortColumn];
      let bVal = b[sortColumn];
      if (sortColumn === "key") {
        if (reportType === "countryBreakdown") {
          aVal = (countryNames[aVal] || aVal).toLowerCase();
          bVal = (countryNames[bVal] || bVal).toLowerCase();
        } else if (reportType === "languageBreakdown") {
          try {
            aVal = (languageDisplayNameResolver.of(aVal) || aVal).toLowerCase();
            bVal = (languageDisplayNameResolver.of(bVal) || bVal).toLowerCase();
          } catch (e) {}
        } else {
          aVal = aVal.toLowerCase();
          bVal = bVal.toLowerCase();
        }
        return sortDirection === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
    });
  }

  function applySearch(query) {
    const reportType = detailDrawer.dataset.reportType;
    filteredData = query
      ? detailTableData.filter((item) => {
          let searchStr = item.key;
          if (reportType === "countryBreakdown") {
            searchStr = countryNames[item.key] || item.key;
          } else if (reportType === "languageBreakdown") {
            try {
              searchStr = languageDisplayNameResolver.of(item.key) || item.key;
            } catch (e) {}
          }
          return searchStr.toLowerCase().includes(query.toLowerCase());
        })
      : [...detailTableData];
    currentPage = 1;
    applySort();
    updateTable();
  }

  function updateTable() {
    const reportType = detailDrawer.dataset.reportType;
    const isErrorLog = reportType === "topJsErrors";
    const isCustomEvents = reportType === "topCustomEvents";
    const isCountryBreakdown = reportType === "countryBreakdown";
    const isLanguageBreakdown = reportType === "languageBreakdown";

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
    let tableHTML = `<table class="detail-table"><thead><tr><th data-column="key">Item ${sortColumn === "key" ? (sortDirection === "asc" ? '<i class="fa-solid fa-sort-up"></i>' : '<i class="fa-solid fa-sort-down"></i>') : '<i class="fa-solid fa-sort"></i>'}</th><th data-column="count">Views ${sortColumn === "count" ? (sortDirection === "asc" ? '<i class="fa-solid fa-sort-up"></i>' : '<i class="fa-solid fa-sort-down"></i>') : '<i class="fa-solid fa-sort"></i>'}</th><th data-column="percentage">Percentage ${sortColumn === "percentage" ? (sortDirection === "asc" ? '<i class="fa-solid fa-sort-up"></i>' : '<i class="fa-solid fa-sort-down"></i>') : '<i class="fa-solid fa-sort"></i>'}</th></tr></thead><tbody>`;
    for (const item of pageData) {
      const isClickable = isErrorLog || (isCustomEvents && item.hasData) || isCountryBreakdown;
      const rowClass = isClickable ? "clickable" : "";
      const stackTraceText = typeof item.stackTrace === "string" && item.stackTrace.length > 0 ? item.stackTrace : "Stack trace unavailable.";
      const breadcrumbsJson = isErrorLog && Array.isArray(item.breadcrumbs) && item.breadcrumbs.length > 0 ? JSON.stringify(item.breadcrumbs).replace(/"/g, "&quot;") : "";
      const dataAttr = isErrorLog ? `data-stacktrace="${stackTraceText.replace(/"/g, "&quot;")}" data-breadcrumbs="${breadcrumbsJson}"` : "";
      const eventNameAttr = isCustomEvents ? `data-event-name="${item.key}"` : "";
      const countryCodeAttr = isCountryBreakdown ? `data-country-code="${item.key}"` : "";
      let keyDisplay = item.key;
      if (isCountryBreakdown) {
        keyDisplay = countryNames[item.key] || item.key;
      } else if (isLanguageBreakdown) {
        try {
          keyDisplay = languageDisplayNameResolver.of(item.key) || item.key;
        } catch (e) {}
      }
      const icon = isCustomEvents && item.hasData ? ' <i class="fa-solid fa-circle-info"></i>' : "";
      tableHTML += `<tr class="${rowClass}" ${dataAttr} ${eventNameAttr} ${countryCodeAttr}><td>${keyDisplay}${icon}</td><td>${item.count}</td><td>${item.percentage}%</td></tr>`;
    }
    tableHTML += "</tbody></table>";
    tableContainer.innerHTML = tableHTML;

    const rows = tableContainer.querySelectorAll("tbody tr.clickable");
    for (const row of rows) {
      row.addEventListener("click", () => {
        if (isErrorLog) {
          const stackTrace = row.dataset.stacktrace;
          const errorMessage = row.cells[0].textContent;
          const breadcrumbsJson = row.dataset.breadcrumbs;
          let breadcrumbsHtml = "";
          if (breadcrumbsJson) {
            try {
              const breadcrumbs = JSON.parse(breadcrumbsJson);
              if (Array.isArray(breadcrumbs) && breadcrumbs.length > 0) {
                breadcrumbsHtml = `<div class="detail-item-content"><h4 style="margin: 0 0 1rem 0; font-size: 0.875rem; color: var(--text-secondary);">Breadcrumbs (Last ${breadcrumbs.length} steps before error)</h4><div class="breadcrumb-timeline">`;
                for (const crumb of breadcrumbs) {
                  const time = window.formatTime ? window.formatTime(crumb.timestamp) : new Date(crumb.timestamp).toLocaleTimeString();
                  const typeIcon = getBreadcrumbIcon(crumb.type);
                  const typeClass = getBreadcrumbClass(crumb.type);
                  let dataHtml = "";
                  if (crumb.data && Object.keys(crumb.data).length > 0) {
                    const dataItems = Object.entries(crumb.data)
                      .map(([k, v]) => `<span class="breadcrumb-data-item"><strong>${escapeHtml(k)}:</strong> ${escapeHtml(String(v))}</span>`)
                      .join("");
                    dataHtml = `<div class="breadcrumb-data">${dataItems}</div>`;
                  }
                  breadcrumbsHtml += `<div class="breadcrumb-item"><div class="breadcrumb-icon ${typeClass}"><i class="fa-solid ${typeIcon}"></i></div><div class="breadcrumb-content"><div class="breadcrumb-header"><span class="breadcrumb-type">${escapeHtml(crumb.type)}</span><span class="breadcrumb-time">${time}</span></div><div class="breadcrumb-message">${escapeHtml(crumb.message)}</div>${dataHtml}</div></div>`;
                }
                breadcrumbsHtml += "</div></div>";
              }
            } catch (e) {
              console.error("Failed to parse breadcrumbs:", e);
            }
          }
          const content = `${breadcrumbsHtml}<div class="detail-item-content"><h4 style="margin: 0 0 1rem 0; font-size: 0.875rem; color: var(--text-secondary);">Stack Trace</h4><pre class="pre-formatted" style="margin: 0;">${stackTrace || "No stack trace available."}</pre></div>`;
          openItemDetailDrawer(errorMessage, content);
        }
        if (isCustomEvents) {
          const eventName = row.dataset.eventName;
          fetchCustomEventDetails(eventName);
        }
        if (isCountryBreakdown) {
          const countryCode = row.dataset.countryCode;
          const countryName = countryNames[countryCode] || countryCode;
          fetchStateBreakdown(countryCode, countryName);
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
    if (progressBar) {
      progressBar.style.transition = "none";
      progressBar.style.width = "100%";
      progressBar.offsetHeight;
      progressBar.style.transition = `width ${duration}ms linear`;
      progressBar.style.width = "0%";
    }
    if (mobileProgressBar) {
      mobileProgressBar.style.transition = "none";
      mobileProgressBar.style.width = "100%";
      mobileProgressBar.offsetHeight;
      mobileProgressBar.style.transition = `width ${duration}ms linear`;
      mobileProgressBar.style.width = "0%";
    }
  }

  async function updateWebsiteSetting(payload) {
    if (!WEBSITE_ID) return false;
    try {
      const response = await fetch(`/dashboard/settings/${WEBSITE_ID}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error("Failed to update setting");
      }
      return true;
    } catch (error) {
      console.error("Error updating website setting:", error);
      return false;
    }
  }

  if (websiteSettingsBtn) {
    websiteSettingsBtn.addEventListener("click", () => {
      detailDrawerOverlay.classList.add("active");
      websiteSettingsDrawer.classList.add("active");
    });
  }

  if (websiteSettingsBtnSidebar) {
    websiteSettingsBtnSidebar.addEventListener("click", () => {
      detailDrawerOverlay.classList.add("active");
      websiteSettingsDrawer.classList.add("active");
    });
  }

  if (mobileSettingsBtn) {
    mobileSettingsBtn.addEventListener("click", () => {
      detailDrawerOverlay.classList.add("active");
      websiteSettingsDrawer.classList.add("active");
    });
  }

  if (websiteSelector) {
    websiteSelector.addEventListener("change", (e) => {
      const selectedWebsiteId = e.target.value;
      if (selectedWebsiteId) {
        window.location.href = `/dashboard/${selectedWebsiteId}?period=${settings.dataPeriod}&limit=${settings.resultsLimit}`;
      }
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
    disableLocalhostToggle.addEventListener("change", async (e) => {
      const success = await updateWebsiteSetting({
        disableLocalhostTracking: e.target.checked,
      });
      if (success) {
        showToast("Tracking Updated", `Localhost tracking ${e.target.checked ? "disabled" : "enabled"}`, "success");
      } else {
        e.target.checked = !e.target.checked;
        showToast("Error", "Failed to update setting", "error");
      }
    });
  }

  if (dataRetentionInput) {
    dataRetentionInput.addEventListener("change", async (e) => {
      const success = await updateWebsiteSetting({
        dataRetentionDays: e.target.value,
      });
      if (success) {
        const days = e.target.value;
        const message = days > 0 ? `Data retention set to ${days} days` : "Data retention set to forever";
        showToast("Data Retention Updated", message, "success");
      } else {
        showToast("Error", "Failed to update setting", "error");
      }
    });
  }

  const uptimeMonitoringToggle = document.getElementById("uptime-monitoring-toggle");
  if (uptimeMonitoringToggle) {
    uptimeMonitoringToggle.addEventListener("change", async (e) => {
      const enabled = e.target.checked;
      try {
        const response = await fetch(`/uptime/${WEBSITE_ID}/toggle`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled }),
        });
        const data = await response.json();
        if (!data.success) {
          e.target.checked = !enabled;
          window.customAlert("Error", "Failed to update uptime monitoring setting.");
        } else {
          showToast("Uptime Monitoring", `Uptime monitoring ${enabled ? "enabled" : "disabled"}`, "success");
        }
      } catch (error) {
        e.target.checked = !enabled;
        window.customAlert("Error", "Failed to update uptime monitoring setting.");
      }
    });
  }

  const uptimeCheckIntervalSelect = document.getElementById("uptime-check-interval-select");
  if (uptimeCheckIntervalSelect) {
    uptimeCheckIntervalSelect.addEventListener("change", async (e) => {
      const interval = Number.parseInt(e.target.value);
      try {
        const response = await fetch(`/uptime/${WEBSITE_ID}/interval`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ interval }),
        });
        const data = await response.json();
        if (!data.success) {
          window.customAlert("Error", "Failed to update check interval.");
        } else {
          const intervalText = interval >= 60 ? `${interval / 60} minute${interval / 60 > 1 ? "s" : ""}` : `${interval} seconds`;
          showToast("Check Interval Updated", `Check interval set to ${intervalText}`, "success");
        }
      } catch (error) {
        window.customAlert("Error", "Failed to update check interval.");
      }
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
          window.customAlert("Error", errorData.error);
        }
      } catch (error) {
        window.customAlert("Error", "Failed to add IP address.");
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
          window.customAlert("Error", errorData.error);
        }
      } catch (error) {
        window.customAlert("Error", "Failed to add your IP address to blocklist.");
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
          window.customAlert("Error", "Failed to remove your IP address from blocklist.");
        }
      } catch (error) {
        window.customAlert("Error", "Failed to remove your IP address from blocklist.");
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
            window.customAlert("Error", "Failed to remove IP address.");
          }
        } catch (error) {
          window.customAlert("Error", "Failed to remove IP address.");
        }
      }
    });
  }

  window.addEventListener("settingsChanged", updateDashboardSettings);

  window.addEventListener("themeChanged", () => {
    updateChartTheme();
  });

  if (IS_ARCHIVED) {
    if (manualRefreshBtn) manualRefreshBtn.disabled = true;
    if (websiteSettingsBtn) websiteSettingsBtn.disabled = true;
  }

  window.addEventListener("load", () => {
    const loadingCards = document.querySelectorAll(".loading");
    for (const card of loadingCards) {
      card.classList.remove("loading");
    }
    updateDashboardSettings(true);
  });
});
