document.addEventListener("DOMContentLoaded", () => {
  console.log("SEO Analytics page loaded");

  const pageWrapper = document.querySelector(".page-wrapper");
  const WEBSITE_ID = pageWrapper ? pageWrapper.dataset.websiteId : null;
  const runAnalysisBtn = document.getElementById("run-analysis-btn");
  const initialAnalysisBtn = document.getElementById("initial-analysis-btn");
  const analysisSpinner = document.getElementById("analysis-spinner");
  const strategyModal = document.getElementById("strategy-modal-overlay");
  const cancelStrategyBtn = document.getElementById("cancel-strategy-btn");
  const strategyOptions = document.querySelectorAll(".strategy-option");

  console.log("Website ID:", WEBSITE_ID);
  console.log("Run Analysis Button:", runAnalysisBtn);
  console.log("Initial Analysis Button:", initialAnalysisBtn);

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
    console.log("runSeoAnalysis function called");

    if (!WEBSITE_ID) {
      console.error("Website ID not found");
      alert("Error: Website ID not found. Please refresh the page.");
      return;
    }

    const selectedStrategy = await showStrategyModal();

    if (!selectedStrategy) {
      console.log("Analysis cancelled by user");
      return;
    }

    console.log("Starting SEO analysis for website:", WEBSITE_ID, "with strategy:", selectedStrategy);

    if (analysisSpinner) {
      analysisSpinner.style.display = "flex";
      console.log("Spinner shown");
    }

    if (runAnalysisBtn) runAnalysisBtn.disabled = true;
    if (initialAnalysisBtn) initialAnalysisBtn.disabled = true;

    try {
      console.log("Sending POST request to:", `/dashboard/seo/${WEBSITE_ID}/analyze`);

      const response = await fetch(`/dashboard/seo/${WEBSITE_ID}/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ strategy: selectedStrategy }),
      });

      console.log("Response status:", response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Error response:", errorData);
        throw new Error(errorData.error || "Failed to analyze SEO");
      }

      const result = await response.json();
      console.log("SEO analysis completed:", result);
      if (Array.isArray(result.analysisWarnings) && result.analysisWarnings.length > 0) {
        console.warn("Analysis warnings:", result.analysisWarnings);
      }

      window.location.reload();
    } catch (error) {
      console.error("Error running SEO analysis:", error);
      alert(`Error: ${error.message}`);

      if (analysisSpinner) analysisSpinner.style.display = "none";
      if (runAnalysisBtn) runAnalysisBtn.disabled = false;
      if (initialAnalysisBtn) initialAnalysisBtn.disabled = false;
    }
  }

  if (runAnalysisBtn) {
    console.log("Adding click listener to Run Analysis button");
    runAnalysisBtn.addEventListener("click", () => {
      console.log("Run Analysis button clicked");
      runSeoAnalysis();
    });
  }

  if (initialAnalysisBtn) {
    console.log("Adding click listener to Initial Analysis button");
    initialAnalysisBtn.addEventListener("click", () => {
      console.log("Initial Analysis button clicked");
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
