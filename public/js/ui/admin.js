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
    const permissionCatalogNode = document.getElementById("permission-catalog");
    const viewRolePermissionsTitle = document.getElementById("view-role-permissions-title");
    const viewRolePermissionsSubtitle = document.getElementById("view-role-permissions-subtitle");
    const viewRolePermissionsList = document.getElementById("view-role-permissions-list");
    const permissionCatalog = (() => {
      try {
        return JSON.parse(permissionCatalogNode?.textContent || "[]");
      } catch (error) {
        return [];
      }
    })();

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

    document.querySelectorAll("[data-view-role-permissions-trigger]").forEach((button) => {
      button.addEventListener("click", () => {
        const roleDisplayName = button.dataset.roleDisplayName || button.dataset.roleName || "Role";
        const roleName = button.dataset.roleName || "";
        const grantedPermissions = String(button.dataset.rolePermissions || "")
          .split("|")
          .map((value) => value.trim())
          .filter(Boolean);
        const grantedSet = new Set(grantedPermissions);

        if (viewRolePermissionsTitle) {
          viewRolePermissionsTitle.textContent = roleDisplayName;
        }

        if (viewRolePermissionsSubtitle) {
          viewRolePermissionsSubtitle.textContent = roleName
            ? `Granted permissions for ${roleName}.`
            : "Granted permissions for this role.";
        }

        if (viewRolePermissionsList) {
          const sections = permissionCatalog
            .map((group) => {
              const grantedInGroup = (group.permissions || []).filter((permission) => grantedSet.has(permission.key));

              if (!grantedInGroup.length) {
                return "";
              }

              const items = grantedInGroup.map((permission) => `
                <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div class="font-semibold text-slate-900">${permission.label}</div>
                  <div class="mt-1 text-sm text-slate-500">${permission.description}</div>
                  <div class="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">${permission.key}</div>
                </div>
              `).join("");

              return `
                <section class="space-y-3">
                  <h3 class="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">${group.label}</h3>
                  <div class="grid gap-3 md:grid-cols-2">${items}</div>
                </section>
              `;
            })
            .filter(Boolean)
            .join("");

          viewRolePermissionsList.innerHTML = sections || '<p class="text-sm text-slate-500">This role has no granted permissions.</p>';
        }
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

    document.getElementById("view-role-permissions-modal")?.addEventListener("modal:close", () => {
      if (viewRolePermissionsTitle) {
        viewRolePermissionsTitle.textContent = "Role";
      }
      if (viewRolePermissionsSubtitle) {
        viewRolePermissionsSubtitle.textContent = "Granted permissions for this role.";
      }
      if (viewRolePermissionsList) {
        viewRolePermissionsList.innerHTML = '<p class="text-sm text-slate-500">No permissions loaded.</p>';
      }
    });
  });
}());
