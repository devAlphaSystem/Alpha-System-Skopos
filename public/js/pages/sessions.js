document.body.addEventListener("click", async (e) => {
  const deleteSessionButton = e.target.closest(".delete-session-btn");
  const deleteVisitorButton = e.target.closest(".delete-visitor-btn");

  if (deleteSessionButton && !deleteSessionButton.dataset.confirmed) {
    e.preventDefault();
    const form = deleteSessionButton.closest("form");
    if (!form) return;
    const sessionId = deleteSessionButton.dataset.sessionId;
    const confirmed = await window.customConfirm("Delete Session?", "Are you sure you want to delete this session? This action cannot be undone.");
    if (confirmed) {
      window.showLoadingModal("Deleting Session", "Removing session data...");
      deleteSessionButton.dataset.confirmed = "true";
      deleteSessionButton.click();
    }
  } else if (deleteSessionButton?.dataset.confirmed) {
    delete deleteSessionButton.dataset.confirmed;
  }

  if (deleteVisitorButton && !deleteVisitorButton.dataset.confirmed) {
    e.preventDefault();
    const form = deleteVisitorButton.closest("form");
    if (!form) return;
    const visitorId = deleteVisitorButton.dataset.visitorId;
    const confirmed = await window.customConfirm("Delete All Sessions?", `Are you sure you want to delete all sessions for visitor <strong>${visitorId.substring(0, 16)}...</strong>? This action cannot be undone.`);
    if (confirmed) {
      window.showLoadingModal("Deleting Visitor Sessions", "Removing all sessions for this visitor...");
      deleteVisitorButton.dataset.confirmed = "true";
      deleteVisitorButton.click();
    }
  } else if (deleteVisitorButton?.dataset.confirmed) {
    delete deleteVisitorButton.dataset.confirmed;
  }
});
