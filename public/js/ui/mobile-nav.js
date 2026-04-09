// Toggles the mobile navigation drawer in the shared dashboard header.
(function initMobileNavUi() {
  const InventoryUi = window.InventoryUi || {};

  InventoryUi.onReady(() => {
    const toggle = document.getElementById("mobile-nav-toggle");
    const menu = document.getElementById("mobile-nav-menu");

    if (!toggle || !menu) {
      return;
    }

    const openIcon = toggle.querySelector(".mobile-nav-icon-open");
    const closeIcon = toggle.querySelector(".mobile-nav-icon-close");

    // Opens or closes the mobile menu and syncs the toggle button state.
    function setMenuOpen(isOpen) {
      menu.classList.toggle("hidden", !isOpen);
      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
      openIcon?.classList.toggle("hidden", isOpen);
      closeIcon?.classList.toggle("hidden", !isOpen);
    }

    toggle.addEventListener("click", () => {
      const isOpen = toggle.getAttribute("aria-expanded") === "true";
      setMenuOpen(!isOpen);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    });

    document.addEventListener("click", (event) => {
      if (menu.classList.contains("hidden")) return;
      if (menu.contains(event.target) || toggle.contains(event.target)) return;
      setMenuOpen(false);
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth >= 1024) {
        setMenuOpen(false);
      }
    });

    menu.querySelectorAll("a, button[data-open-modal]").forEach((item) => {
      item.addEventListener("click", () => {
        setMenuOpen(false);
      });
    });
  });
}());
