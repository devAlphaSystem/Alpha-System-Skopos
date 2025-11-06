document.addEventListener("DOMContentLoaded", () => {
  const tabs = document.querySelectorAll(".tab-button");
  const tabContents = document.querySelectorAll(".tab-panel");

  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      const tabName = tab.dataset.tab;

      for (const t of tabs) {
        t.classList.remove("active");
      }
      for (const content of tabContents) {
        content.classList.remove("active");
      }

      tab.classList.add("active");
      document.getElementById(tabName).classList.add("active");

      if (tabName === "ip-intelligence" && !window.ipIntelligenceLoaded) {
        loadIpIntelligence();
      }
    });
  }

  const ipElement = document.querySelector(".ip-address-copyable");
  if (ipElement) {
    ipElement.addEventListener("click", async () => {
      const ip = ipElement.dataset.ip;
      try {
        await navigator.clipboard.writeText(ip);
        const originalText = ipElement.textContent;
        ipElement.textContent = "Copied!";
        ipElement.style.color = "var(--success)";
        setTimeout(() => {
          ipElement.textContent = originalText;
          ipElement.style.color = "";
        }, 1500);
      } catch (err) {
        console.error("Failed to copy IP:", err);
      }
    });
  }
});

window.ipIntelligenceLoaded = false;

async function loadIpIntelligence() {
  if (window.ipIntelligenceLoaded) return;
  window.ipIntelligenceLoaded = true;

  const loadingEl = document.getElementById("ip-intelligence-loading");
  const errorEl = document.getElementById("ip-intelligence-error");
  const contentEl = document.getElementById("ip-intelligence-content");
  const errorMessageEl = document.getElementById("ip-intelligence-error-message");

  loadingEl.style.display = "flex";
  errorEl.style.display = "none";
  contentEl.style.display = "none";

  try {
    const sessionId = window.__SESSION_ID__;
    const websiteId = window.__WEBSITE_ID__;

    const response = await fetch(`/api/sessions/${websiteId}/session/${sessionId}/ip-intelligence`);

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      let errorMessage = "Failed to fetch IP intelligence data.";

      if (response.status === 400) {
        errorMessage = data.error || "Invalid request. Please check your Chapybara API key configuration.";
      } else if (response.status === 401 || response.status === 403) {
        errorMessage = "Authentication failed. Your Chapybara API key may be invalid or expired.";
      } else if (response.status === 402) {
        errorMessage = "Quota exceeded. You have reached your daily IP request limit on Chapybara.";
      } else if (response.status === 429) {
        errorMessage = "Rate limit exceeded. Please wait a moment before trying again.";
      } else if (response.status === 503) {
        errorMessage = "Chapybara service is temporarily unavailable. Please try again later.";
      } else if (data.error) {
        errorMessage = data.error;
      }

      throw new Error(errorMessage);
    }

    const data = await response.json();

    loadingEl.style.display = "none";
    contentEl.style.display = "block";
    contentEl.innerHTML = renderIpIntelligence(data);
  } catch (error) {
    console.error("Error loading IP intelligence:", error);
    loadingEl.style.display = "none";
    errorEl.style.display = "block";
    errorMessageEl.textContent = error.message;
    window.ipIntelligenceLoaded = false;
  }
}

window.retryIpIntelligence = () => {
  loadIpIntelligence();
};

function renderIpIntelligence(data) {
  let html = '<div class="session-details-list">';

  html += `<div class="session-detail-item">
    <span class="detail-label">IP Address:</span>
    <span class="detail-value"><code>${escapeHtml(data.ip)}</code></span>
  </div>`;

  if (data.hostnames && data.hostnames.length > 0) {
    html += `<div class="session-detail-item">
      <span class="detail-label">Hostnames:</span>
      <span class="detail-value">${data.hostnames.map((h) => `<code>${escapeHtml(h)}</code>`).join(", ")}</span>
    </div>`;
  }

  if (data.location) {
    const loc = data.location;

    if (loc.continent?.name) {
      html += `<div class="session-detail-item">
        <span class="detail-label">Continent:</span>
        <span class="detail-value">${escapeHtml(loc.continent.name)} (${escapeHtml(loc.continent.code)})</span>
      </div>`;
    }

    if (loc.country?.name) {
      html += `<div class="session-detail-item">
        <span class="detail-label">Country:</span>
        <span class="detail-value">${escapeHtml(loc.country.name)} (${escapeHtml(loc.country.code)})${loc.country.capital ? ` - Capital: ${escapeHtml(loc.country.capital)}` : ""}</span>
      </div>`;
    }

    if (loc.region?.name) {
      html += `<div class="session-detail-item">
        <span class="detail-label">Region:</span>
        <span class="detail-value">${escapeHtml(loc.region.name)}${loc.region.code ? ` (${escapeHtml(loc.region.code)})` : ""}</span>
      </div>`;
    }

    if (loc.city?.name) {
      html += `<div class="session-detail-item">
        <span class="detail-label">City:</span>
        <span class="detail-value">${escapeHtml(loc.city.name)}</span>
      </div>`;
    }

    if (loc.latitude && loc.longitude) {
      html += `<div class="session-detail-item">
        <span class="detail-label">Coordinates:</span>
        <span class="detail-value">${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}</span>
      </div>`;
    }
  }

  if (data.network) {
    const net = data.network;

    if (net.asn) {
      html += `<div class="session-detail-item">
        <span class="detail-label">ASN:</span>
        <span class="detail-value">${escapeHtml(net.asn)}</span>
      </div>`;
    }

    if (net.organization) {
      html += `<div class="session-detail-item">
        <span class="detail-label">Organization:</span>
        <span class="detail-value">${escapeHtml(net.organization)}</span>
      </div>`;
    }

    if (net.isp) {
      html += `<div class="session-detail-item">
        <span class="detail-label">ISP:</span>
        <span class="detail-value">${escapeHtml(net.isp)}</span>
      </div>`;
    }

    if (net.usage_type) {
      html += `<div class="session-detail-item">
        <span class="detail-label">Network Type:</span>
        <span class="detail-value">${escapeHtml(net.usage_type)}</span>
      </div>`;
    }

    if (net.mobile) {
      html += `<div class="session-detail-item">
        <span class="detail-label">Mobile Network:</span>
        <span class="detail-value">${net.mobile.is_mobile ? "Yes" : "No"}${net.mobile.brand ? ` - ${escapeHtml(net.mobile.brand)}` : ""}</span>
      </div>`;
    }
  }

  if (data.time_zone) {
    html += `<div class="session-detail-item">
      <span class="detail-label">Time Zone:</span>
      <span class="detail-value">${escapeHtml(data.time_zone)}</span>
    </div>`;
  }

  if (data.security) {
    const sec = data.security;

    html += `<div class="session-detail-item">
      <span class="detail-label">Threat Level:</span>
      <span class="detail-value">
        <span class="badge-${sec.threat_level === "none" ? "success" : sec.threat_level === "low" ? "warning" : "danger"}" style="text-transform: uppercase;">
          ${escapeHtml(sec.threat_level)}
        </span>
      </span>
    </div>`;

    html += `<div class="session-detail-item">
      <span class="detail-label">Is Proxy:</span>
      <span class="detail-value">
        <span class="badge-${sec.is_proxy ? "warning" : "success"}">${sec.is_proxy ? "Yes" : "No"}</span>
        ${sec.proxy_type ? ` (${escapeHtml(sec.proxy_type)})` : ""}
      </span>
    </div>`;

    html += `<div class="session-detail-item">
      <span class="detail-label">Is VPN:</span>
      <span class="detail-value"><span class="badge-${sec.is_vpn ? "warning" : "success"}">${sec.is_vpn ? "Yes" : "No"}</span></span>
    </div>`;

    html += `<div class="session-detail-item">
      <span class="detail-label">Is Tor:</span>
      <span class="detail-value"><span class="badge-${sec.is_tor ? "danger" : "success"}">${sec.is_tor ? "Yes" : "No"}</span></span>
    </div>`;

    html += `<div class="session-detail-item">
      <span class="detail-label">Is Datacenter:</span>
      <span class="detail-value"><span class="badge-${sec.is_datacenter ? "default" : "success"}">${sec.is_datacenter ? "Yes" : "No"}</span></span>
    </div>`;

    html += `<div class="session-detail-item">
      <span class="detail-label">Is Spammer:</span>
      <span class="detail-value"><span class="badge-${sec.is_spammer ? "danger" : "success"}">${sec.is_spammer ? "Yes" : "No"}</span></span>
    </div>`;
  }

  if (data.ads) {
    html += `<div class="session-detail-item">
      <span class="detail-label">Ad Category:</span>
      <span class="detail-value">${escapeHtml(data.ads.category_name)} (${escapeHtml(data.ads.category_code)})</span>
    </div>`;
  }

  html += "</div>";
  return html;
}

function escapeHtml(text) {
  if (text === null || text === undefined) return "";
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return String(text).replace(/[&<>"']/g, (m) => map[m]);
}

document.body.addEventListener("click", async (e) => {
  const deleteSessionButton = e.target.closest(".delete-session-btn");

  if (deleteSessionButton && !deleteSessionButton.dataset.confirmed) {
    e.preventDefault();
    const form = deleteSessionButton.closest("form");
    if (!form) return;
    const confirmed = await window.customConfirm("Delete Session?", "Are you sure you want to delete this session? This action cannot be undone.");
    if (confirmed) {
      window.showLoadingModal("Deleting Session", "Removing session data...");
      deleteSessionButton.dataset.confirmed = "true";
      deleteSessionButton.click();
    }
  } else if (deleteSessionButton?.dataset.confirmed) {
    delete deleteSessionButton.dataset.confirmed;
  }
});
