// Shared browser helpers used by the split dashboard UI scripts.
(function initInventoryUiCore() {
  const globalUi = window.InventoryUi || {};

  // Runs a callback immediately or after DOMContentLoaded when the page is ready.
  globalUi.onReady = function onReady(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
      return;
    }

    callback();
  };

  window.InventoryUi = globalUi;
}());
