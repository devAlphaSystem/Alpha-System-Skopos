document.addEventListener("DOMContentLoaded", () => {
  const tabs = document.querySelectorAll(".tab-button");
  const panels = document.querySelectorAll(".tab-panel");

  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      const targetPanel = tab.dataset.tab;

      for (const t of tabs) {
        t.classList.remove("active");
      }

      for (const panelEl of panels) {
        panelEl.classList.remove("active");
      }

      tab.classList.add("active");
      const panel = document.getElementById(`${targetPanel}-panel`);
      if (panel) {
        panel.classList.add("active");
      }
    });
  }
});

window.addApiKey = async (event, service) => {
  event.preventDefault();
  const form = event.target;
  const apiKeyInput = form.querySelector('[name="apiKey"]');
  const apiKey = apiKeyInput ? apiKeyInput.value.trim() : "";

  if (!apiKey) {
    await window.customAlert("Missing API Key", "Please enter an API key.");
    return;
  }

  const submitBtn = form.querySelector('button[type="submit"]');
  if (!submitBtn) {
    return;
  }

  const originalText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

  try {
    const response = await fetch("/settings/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service, apiKey }),
    });

    const data = await response.json();

    if (response.ok) {
      window.location.reload();
      return;
    }

    await window.customAlert("Save Failed", data.error || "Failed to save API key.");
  } catch (error) {
    console.error("Error saving API key:", error);
    await window.customAlert("Network Error", "Error saving API key. Please try again.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
};

window.deleteApiKey = async (keyId, serviceName) => {
  const serviceLabel = serviceName.replace(/_/g, " ");
  const confirmed = await window.customConfirm("Remove API Key?", `Are you sure you want to remove your ${serviceLabel} API key? This action cannot be undone.`);

  if (!confirmed) {
    return;
  }

  try {
    const response = await fetch(`/settings/api-keys/${keyId}`, {
      method: "DELETE",
    });

    const data = await response.json();

    if (response.ok) {
      window.location.reload();
      return;
    }

    await window.customAlert("Delete Failed", data.error || "Failed to delete API key.");
  } catch (error) {
    console.error("Error deleting API key:", error);
    await window.customAlert("Network Error", "Error deleting API key. Please try again.");
  }
};
