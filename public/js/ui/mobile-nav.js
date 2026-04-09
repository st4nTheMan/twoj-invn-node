// Toggles the mobile navigation drawer in the shared dashboard header.
(function initMobileNavUi() {
  const InventoryUi = window.InventoryUi || {};

  InventoryUi.onReady(() => {
    const toggle = document.getElementById("mobile-nav-toggle");
    const menu = document.getElementById("mobile-nav-menu");
    const drawer = document.getElementById("mobile-nav-drawer");

    if (!toggle || !menu) {
      return;
    }

    const closeButton = document.getElementById("mobile-nav-close");
    closeButton?.addEventListener("click", () => setMenuOpen(false));

    // Opens or closes the mobile menu and syncs the toggle button state.
    function setMenuOpen(isOpen) {
      if (isOpen) {
        menu.classList.remove("hidden");
        menu.classList.add("flex");
        requestAnimationFrame(() => {
          drawer?.classList.remove("translate-x-full");
          drawer?.classList.add("translate-x-0");
        });
      } else {
        drawer?.classList.remove("translate-x-0");
        drawer?.classList.add("translate-x-full");
        setTimeout(() => {
          menu.classList.add("hidden");
          menu.classList.remove("flex");
        }, 300);
      }

      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
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

    menu.addEventListener("click", (event) => {
      if (event.target === menu) {
        setMenuOpen(false);
      }
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