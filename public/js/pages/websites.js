function copyToClipboard(text, button) {
  navigator.clipboard.writeText(text).then(() => {
    const originalIcon = button.innerHTML;
    button.innerHTML = '<i class="fa-solid fa-check"></i>';
    setTimeout(() => {
      button.innerHTML = originalIcon;
    }, 2000);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const websiteForm = document.querySelector(".website-form");
  if (websiteForm) {
    websiteForm.addEventListener("submit", (e) => {
      window.showLoadingModal("Adding Website", "Creating your new website...");
    });
  }

  document.body.addEventListener("click", async (e) => {
    const archiveButton = e.target.closest(".archive-website-btn");
    const deleteButton = e.target.closest(".delete-website-btn");
    const restoreButton = e.target.closest(".restore-website-btn");

    if (archiveButton && !archiveButton.dataset.confirmed) {
      e.preventDefault();
      const form = archiveButton.closest("form");
      if (!form) return;
      const websiteName = archiveButton.dataset.websiteName;
      const confirmed = await window.customConfirm("Archive Website?", `Are you sure you want to archive <strong>${websiteName}</strong>? Tracking will be disabled.`);
      if (confirmed) {
        window.showLoadingModal("Archiving Website", `Archiving ${websiteName}...`);
        archiveButton.dataset.confirmed = "true";
        archiveButton.click();
      }
    } else if (archiveButton?.dataset.confirmed) {
      delete archiveButton.dataset.confirmed;
    }

    if (restoreButton && !restoreButton.dataset.confirmed) {
      e.preventDefault();
      const form = restoreButton.closest("form");
      if (!form) return;
      const websiteName = restoreButton.dataset.websiteName;
      const confirmed = await window.customConfirm("Restore Website?", `Are you sure you want to restore <strong>${websiteName}</strong>? Tracking will be re-enabled.`);
      if (confirmed) {
        window.showLoadingModal("Restoring Website", `Restoring ${websiteName}...`);
        restoreButton.dataset.confirmed = "true";
        restoreButton.click();
      }
    } else if (restoreButton?.dataset.confirmed) {
      delete restoreButton.dataset.confirmed;
    }

    if (deleteButton && !deleteButton.dataset.confirmed) {
      e.preventDefault();
      const form = deleteButton.closest("form");
      if (!form) return;
      const websiteName = deleteButton.dataset.websiteName;
      const confirmedDelete = await window.customConfirm("Permanently Delete Website?", `You are about to permanently delete <strong>${websiteName}</strong>. This action cannot be undone.`);
      if (confirmedDelete) {
        const deleteData = await window.customAction("Delete Associated Data?", `Do you also want to permanently delete all associated analytics data for <strong>${websiteName}</strong>? This is highly recommended.`);
        const deleteDataInput = document.createElement("input");
        deleteDataInput.type = "hidden";
        deleteDataInput.name = "deleteData";
        deleteDataInput.value = deleteData;
        form.appendChild(deleteDataInput);
        window.showLoadingModal("Deleting Website", `Permanently deleting ${websiteName}...`);
        deleteButton.dataset.confirmed = "true";
        deleteButton.click();
      }
    } else if (deleteButton?.dataset.confirmed) {
      delete deleteButton.dataset.confirmed;
    }
  });
});
