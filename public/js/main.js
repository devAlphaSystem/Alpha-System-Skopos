window.showLoadingModal = (title = "Processing...", message = "Please wait") => {
  const overlay = document.getElementById("loading-modal-overlay");
  const titleEl = document.getElementById("loading-modal-title");
  const messageEl = document.getElementById("loading-modal-message");
  if (overlay && titleEl && messageEl) {
    titleEl.textContent = title;
    messageEl.textContent = message;
    overlay.classList.add("active");
  }
};

window.hideLoadingModal = () => {
  const overlay = document.getElementById("loading-modal-overlay");
  if (overlay) {
    overlay.classList.remove("active");
  }
};

document.addEventListener("DOMContentLoaded", () => {
  const sidebarToggle = document.getElementById("sidebar-toggle");
  const mobileSidebarToggle = document.getElementById("mobile-sidebar-toggle");
  const sidebar = document.getElementById("sidebar");
  const sidebarCollapseBtn = document.getElementById("sidebar-collapse-btn");
  const websiteSelector = document.getElementById("website-selector");

  if (window.__SKOPOS_SETTINGS__?.sidebarCollapsed) {
    sidebar?.classList.add("collapsed");
  }

  setTimeout(() => {
    document.documentElement.classList.remove("sidebar-collapsed-init");
  }, 50);

  if (sidebarCollapseBtn && sidebar) {
    sidebarCollapseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      sidebar.classList.toggle("collapsed");

      const settings = window.__SKOPOS_SETTINGS__ || {};
      settings.sidebarCollapsed = sidebar.classList.contains("collapsed");
      localStorage.setItem("skopos-settings", JSON.stringify(settings));
      window.__SKOPOS_SETTINGS__ = settings;
    });
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

  if (websiteSelector) {
    websiteSelector.addEventListener("change", (e) => {
      const selectedWebsiteId = e.target.value;
      if (selectedWebsiteId) {
        window.location.href = `/dashboard/${selectedWebsiteId}`;
      }
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

  window.customAlert = (title, body) => {
    const buttons = [{ text: "OK", class: "btn", value: true }];
    return showModal(title, body, buttons);
  };

  document.body.addEventListener("click", (e) => {
    const ipElement = e.target.closest(".ip-address-copyable");
    if (ipElement) {
      e.stopPropagation();
      const ip = ipElement.dataset.ip;

      navigator.clipboard
        .writeText(ip)
        .then(() => {
          const tooltip = document.createElement("div");
          tooltip.className = "ip-copy-tooltip";
          tooltip.textContent = "IP copied!";
          tooltip.style.left = `${e.clientX}px`;
          tooltip.style.top = `${e.clientY - 40}px`;
          document.body.appendChild(tooltip);

          setTimeout(() => tooltip.remove(), 900);
        })
        .catch((err) => {
          console.error("Failed to copy IP:", err);
        });
    }
  });
});
