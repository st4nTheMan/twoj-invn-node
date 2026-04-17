// Handles admin-panel actions that need to populate shared modals dynamically.
(function initAdminUi() {
  const InventoryUi = window.InventoryUi || {};

  InventoryUi.onReady(() => {
    if (window.location.pathname !== "/admin") {
      return;
    }

    const resetPasswordForm = document.getElementById("reset-user-password-form");
    const resetPasswordDescription = document.getElementById("reset-user-password-description");
    const resetPasswordInput = document.getElementById("reset-user-password");
    const resetPasswordConfirmInput = document.getElementById("reset-user-confirm-password");
    const passwordToggleButtons = document.querySelectorAll("[data-password-toggle]");

    passwordToggleButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const targetId = button.dataset.target || "";
        const input = document.getElementById(targetId);

        if (!input) {
          return;
        }

        const shouldShow = input.type === "password";
        input.type = shouldShow ? "text" : "password";
        button.setAttribute("aria-pressed", shouldShow ? "true" : "false");
        button.setAttribute("aria-label", shouldShow ? "Hide password" : "Show password");
        button.querySelector("[data-eye-open]")?.classList.toggle("hidden", shouldShow);
        button.querySelector("[data-eye-closed]")?.classList.toggle("hidden", !shouldShow);
      });
    });

    document.querySelectorAll("[data-reset-password-trigger]").forEach((button) => {
      button.addEventListener("click", () => {
        const userId = button.dataset.userId || "0";
        const username = button.dataset.username || "this user";

        if (resetPasswordForm) {
          resetPasswordForm.action = `/admin/users/${encodeURIComponent(userId)}/password`;
          resetPasswordForm.reset();
        }

        if (resetPasswordDescription) {
          resetPasswordDescription.textContent = `Set a new password for ${username}.`;
        }

        window.setTimeout(() => {
          resetPasswordInput?.focus();
        }, 0);
      });
    });

    document.getElementById("reset-user-password-modal")?.addEventListener("modal:close", () => {
      resetPasswordForm?.reset();
      if (resetPasswordDescription) {
        resetPasswordDescription.textContent = "Set a new password for this user.";
      }
      [resetPasswordInput, resetPasswordConfirmInput].forEach((input) => {
        if (input) {
          input.type = "password";
        }
      });
      passwordToggleButtons.forEach((button) => {
        button.setAttribute("aria-pressed", "false");
        const targetId = button.dataset.target || "";
        button.setAttribute(
          "aria-label",
          targetId === "reset-user-confirm-password" ? "Show password confirmation" : "Show password"
        );
        button.querySelector("[data-eye-open]")?.classList.remove("hidden");
        button.querySelector("[data-eye-closed]")?.classList.add("hidden");
      });
      resetPasswordConfirmInput?.blur();
    });
  });
}());
