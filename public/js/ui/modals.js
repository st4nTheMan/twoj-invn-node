// Handles opening and closing reusable modal windows across the dashboard.
(function initModalUi() {
  const InventoryUi = window.InventoryUi || {};
  const MODAL_EXIT_DURATION_MS = 220;

  InventoryUi.onReady(() => {
    const body = document.body;
    function openModal(modalId) {
      const modal = document.getElementById(modalId);
      if (!modal) return;

      window.clearTimeout(modal.closeTimer);
      window.clearTimeout(modal.autoCloseTimer);
      delete modal.closeTimer;
      delete modal.autoCloseTimer;
      modal.dataset.modalState = "opening";
      modal.classList.remove("hidden");
      body.classList.add("modal-open");
      modal.dispatchEvent(new CustomEvent("modal:open"));

      const autoCloseMs = Number(modal.dataset.autoCloseMs || 0);
      if (autoCloseMs > 0) {
        modal.autoCloseTimer = window.setTimeout(() => {
          closeModal(modal);
        }, autoCloseMs);
      }
    }

    function closeModal(modal) {
      if (!modal) return;
      if (modal.classList.contains("hidden") || modal.dataset.modalState === "closing") return;

      window.clearTimeout(modal.autoCloseTimer);
      delete modal.autoCloseTimer;
      modal.dataset.modalState = "closing";
      modal.dispatchEvent(new CustomEvent("modal:close"));
      modal.closeTimer = window.setTimeout(() => {
        modal.classList.add("hidden");
        delete modal.dataset.modalState;
        delete modal.closeTimer;

        const openModals = document.querySelectorAll("[data-modal]:not(.hidden)");
        if (!openModals.length) {
          body.classList.remove("modal-open");
        }
      }, MODAL_EXIT_DURATION_MS);
    }

    InventoryUi.openModal = openModal;
    InventoryUi.closeModal = closeModal;

    document.querySelectorAll("[data-open-modal]").forEach((button) => {
      button.addEventListener("click", () => openModal(button.dataset.openModal));
    });

    document.querySelectorAll("[data-close-modal]").forEach((button) => {
      button.addEventListener("click", () => closeModal(button.closest("[data-modal]")));
    });

    document.querySelectorAll("[data-modal]").forEach((modal) => {
      modal.addEventListener("click", (event) => {
        if (event.target === modal) {
          closeModal(modal);
        }
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;

      document.querySelectorAll("[data-modal]:not(.hidden)").forEach((modal) => {
        closeModal(modal);
      });
    });

    document.querySelectorAll("[data-open-modal-on-load]").forEach((node) => {
      if (node.dataset.openModalOnLoad) {
        openModal(node.dataset.openModalOnLoad);
      }
    });

    const pageState = document.getElementById("page-state");
    if (pageState?.dataset.openModal) {
      openModal(pageState.dataset.openModal);
    }
  });

  window.InventoryUi = InventoryUi;
}());
