document.addEventListener("DOMContentLoaded", () => {
  const pageWrapper = document.querySelector(".page-wrapper");
  const WEBSITE_ID = pageWrapper ? pageWrapper.dataset.websiteId : null;
  const runAnalysisBtn = document.getElementById("run-analysis-btn");
  const initialAnalysisBtn = document.getElementById("initial-analysis-btn");
  const strategyModal = document.getElementById("strategy-modal-overlay");
  const cancelStrategyBtn = document.getElementById("cancel-strategy-btn");
  const strategyOptions = document.querySelectorAll(".strategy-option");

  function showStrategyModal() {
    return new Promise((resolve) => {
      if (strategyModal) {
        strategyModal.style.display = "flex";

        const handleStrategySelect = (e) => {
          const button = e.target.closest(".strategy-option");
          if (button) {
            const strategy = button.dataset.strategy;
            strategyModal.style.display = "none";
            cleanup();
            resolve(strategy);
          }
        };

        const handleCancel = () => {
          strategyModal.style.display = "none";
          cleanup();
          resolve(null);
        };

        const cleanup = () => {
          for (const option of strategyOptions) {
            option.removeEventListener("click", handleStrategySelect);
          }
          if (cancelStrategyBtn) {
            cancelStrategyBtn.removeEventListener("click", handleCancel);
          }
          strategyModal.removeEventListener("click", handleOverlayClick);
        };

        const handleOverlayClick = (e) => {
          if (e.target === strategyModal) {
            handleCancel();
          }
        };

        for (const option of strategyOptions) {
          option.addEventListener("click", handleStrategySelect);
        }

        if (cancelStrategyBtn) {
          cancelStrategyBtn.addEventListener("click", handleCancel);
        }

        strategyModal.addEventListener("click", handleOverlayClick);
      } else {
        resolve("mobile");
      }
    });
  }

  async function runSeoAnalysis() {
    if (!WEBSITE_ID) {
      console.error("Website ID not found");
      window.customAlert("Error", "Website ID not found. Please refresh the page.");
      return;
    }

    const selectedStrategy = await showStrategyModal();

    if (!selectedStrategy) {
      return;
    }

    window.showLoadingModal("Analyzing SEO", "This may take 30-60 seconds. Please wait...");

    if (runAnalysisBtn) runAnalysisBtn.disabled = true;
    if (initialAnalysisBtn) initialAnalysisBtn.disabled = true;

    try {
      const response = await fetch(`/dashboard/seo/${WEBSITE_ID}/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ strategy: selectedStrategy }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Error response:", errorData);
        window.hideLoadingModal();
        throw new Error(errorData.error || "Failed to analyze SEO");
      }

      const result = await response.json();
      if (Array.isArray(result.analysisWarnings) && result.analysisWarnings.length > 0) {
        console.warn("Analysis warnings:", result.analysisWarnings);
      }

      window.location.reload();
    } catch (error) {
      console.error("Error running SEO analysis:", error);
      window.hideLoadingModal();
      window.customAlert("Error", error.message);

      if (runAnalysisBtn) runAnalysisBtn.disabled = false;
      if (initialAnalysisBtn) initialAnalysisBtn.disabled = false;
    }
  }

  if (runAnalysisBtn) {
    runAnalysisBtn.addEventListener("click", () => {
      runSeoAnalysis();
    });
  }

  if (initialAnalysisBtn) {
    initialAnalysisBtn.addEventListener("click", () => {
      runSeoAnalysis();
    });
  }

  const sidebarToggle = document.getElementById("sidebar-toggle");
  const sidebar = document.querySelector(".sidebar");
  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener("click", () => {
      sidebar.classList.toggle("active");
    });
  }

  document.addEventListener("click", (e) => {
    if (sidebar && !sidebar.contains(e.target) && !sidebarToggle?.contains(e.target)) {
      sidebar.classList.remove("active");
    }
  });
});
