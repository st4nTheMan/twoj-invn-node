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
    const appBackupForm = document.getElementById("manage-app-backup-form");
    const appBackupFileInput = document.getElementById("app-backup-file");
    const appBackupVisibleInput = document.getElementById("app-backup-json-visible");
    const appBackupHiddenInput = document.getElementById("app-backup-json");
    const appBackupFileStatus = document.getElementById("app-backup-file-status");
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

    let currentRoleId = null;
    let currentRoleIsSystem = false;

    document.querySelectorAll("[data-view-role-permissions-trigger]").forEach((button) => {
      button.addEventListener("click", () => {
        const roleDisplayName = button.dataset.roleDisplayName || button.dataset.roleName || "Role";
        const roleName = button.dataset.roleName || "";
        const roleId = button.dataset.roleId || "";
        const isSystem = button.dataset.roleIsSystem === "1";
        const grantedPermissions = String(button.dataset.rolePermissions || "")
          .split("|")
          .map((value) => value.trim())
          .filter(Boolean);
        const grantedSet = new Set(grantedPermissions);

        currentRoleId = roleId;
        currentRoleIsSystem = isSystem;

        if (viewRolePermissionsTitle) {
          viewRolePermissionsTitle.textContent = roleDisplayName;
        }
        if (viewRolePermissionsSubtitle) {
          viewRolePermissionsSubtitle.textContent = roleName
            ? `Granted permissions for ${roleName}.`
            : "Granted permissions for this role.";
        }

        // Render read-only view.
        if (viewRolePermissionsList) {
          const sections = permissionCatalog
            .map((group) => {
              const grantedInGroup = (group.permissions || []).filter((p) => grantedSet.has(p.key));
              if (!grantedInGroup.length) return "";
              const items = grantedInGroup.map((p) => `
                <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div class="font-semibold text-slate-900">${p.label}</div>
                  <div class="mt-1 text-sm text-slate-500">${p.description}</div>
                  <div class="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">${p.key}</div>
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

        // Pre-build edit view with checkboxes.
        const editList = document.getElementById("edit-role-permissions-list");
        if (editList) {
          const editSections = permissionCatalog.map((group) => {
            const items = (group.permissions || []).map((p) => `
              <label class="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm cursor-pointer hover:border-sky-300 hover:bg-sky-50/50">
                <input
                  type="checkbox"
                  name="permissions"
                  value="${p.key}"
                  ${grantedSet.has(p.key) ? "checked" : ""}
                  class="mt-1 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                >
                <span>
                  <span class="block font-semibold text-slate-900">${p.label}</span>
                  <span class="block text-slate-500">${p.description}</span>
                </span>
              </label>
            `).join("");
            return `
              <section class="space-y-3">
                <h3 class="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">${group.label}</h3>
                <div class="grid gap-3 md:grid-cols-2">${items}</div>
              </section>
            `;
          }).join("");
          editList.innerHTML = editSections;
        }

        // Ensure read-only mode on open.
        enterViewMode();
      });
    });

    function enterViewMode() {
      const viewList = document.getElementById("view-role-permissions-list");
      const editList = document.getElementById("edit-role-permissions-list");
      const editButton = document.getElementById("edit-role-permissions-button");
      const saveButton = document.getElementById("save-role-permissions-button");
      const cancelButton = document.getElementById("cancel-role-permissions-button");
      const statusEl = document.getElementById("edit-role-permissions-status");

      if (viewList) viewList.classList.remove("hidden");
      if (editList) editList.classList.add("hidden");
      if (saveButton) saveButton.classList.add("hidden");
      if (cancelButton) cancelButton.classList.add("hidden");
      if (statusEl) statusEl.className = "mt-4 hidden rounded-2xl border px-4 py-3 text-sm";

      // Show edit button only for custom roles.
      if (editButton) {
        if (currentRoleIsSystem === true || currentRoleIsSystem === "1") {
          editButton.classList.add("hidden");
        } else {
          editButton.classList.remove("hidden");
        }
      }
    }

    function enterEditMode() {
      const viewList = document.getElementById("view-role-permissions-list");
      const editList = document.getElementById("edit-role-permissions-list");
      const editButton = document.getElementById("edit-role-permissions-button");
      const saveButton = document.getElementById("save-role-permissions-button");
      const cancelButton = document.getElementById("cancel-role-permissions-button");

      if (viewList) viewList.classList.add("hidden");
      if (editList) editList.classList.remove("hidden");
      if (editButton) editButton.classList.add("hidden");
      if (saveButton) saveButton.classList.remove("hidden");
      if (cancelButton) cancelButton.classList.remove("hidden");
    }

    function setPermissionEditStatus(type, message) {
      const statusEl = document.getElementById("edit-role-permissions-status");
      if (!statusEl) return;
      if (!message) {
        statusEl.className = "mt-4 hidden rounded-2xl border px-4 py-3 text-sm";
        return;
      }
      statusEl.textContent = message;
      statusEl.className = [
        "mt-4 rounded-2xl border px-4 py-3 text-sm",
        type === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-rose-200 bg-rose-50 text-rose-800"
      ].join(" ");
    }

    document.getElementById("edit-role-permissions-button")?.addEventListener("click", enterEditMode);

    document.getElementById("cancel-role-permissions-button")?.addEventListener("click", enterViewMode);

    document.getElementById("save-role-permissions-button")?.addEventListener("click", async () => {
      if (!currentRoleId) return;

      const editList = document.getElementById("edit-role-permissions-list");
      const checked = Array.from(editList?.querySelectorAll('input[name="permissions"]:checked') || [])
        .map((input) => input.value);

      if (!checked.length) {
        setPermissionEditStatus("error", "Choose at least one permission.");
        return;
      }

      const saveButton = document.getElementById("save-role-permissions-button");
      if (saveButton) {
        saveButton.disabled = true;
        saveButton.classList.add("opacity-70", "cursor-not-allowed");
      }
      setPermissionEditStatus("", "");

      try {
        const body = new URLSearchParams();
        checked.forEach((key) => body.append("permissions", key));

        const response = await fetch(`/admin/roles/${encodeURIComponent(currentRoleId)}/permissions`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest"
          },
          body: body.toString()
        });
        const payload = await response.json();

        if (!payload.ok) {
          setPermissionEditStatus("error", payload.message || "Unable to save changes.");
          return;
        }

        // Update the read-only view to reflect new permissions.
        const grantedSet = new Set(checked);
        const sections = permissionCatalog
          .map((group) => {
            const grantedInGroup = (group.permissions || []).filter((p) => grantedSet.has(p.key));
            if (!grantedInGroup.length) return "";
            const items = grantedInGroup.map((p) => `
              <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div class="font-semibold text-slate-900">${p.label}</div>
                <div class="mt-1 text-sm text-slate-500">${p.description}</div>
                <div class="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">${p.key}</div>
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

        const viewList = document.getElementById("view-role-permissions-list");
        if (viewList) {
          viewList.innerHTML = sections || '<p class="text-sm text-slate-500">This role has no granted permissions.</p>';
        }

        // Update the trigger button's data attribute so reopening shows new permissions.
        const triggerButton = document.querySelector(
          `[data-view-role-permissions-trigger][data-role-id="${currentRoleId}"]`
        );
        if (triggerButton) {
          triggerButton.dataset.rolePermissions = checked.join("|");
        }

        enterViewMode();
        InventoryUi.showFlashFeedback?.("success", payload.message || "Permissions updated successfully.");
      } catch (error) {
        setPermissionEditStatus("error", "Unable to save changes right now.");
      } finally {
        if (saveButton) {
          saveButton.disabled = false;
          saveButton.classList.remove("opacity-70", "cursor-not-allowed");
        }
      }
    });

    function syncBackupJsonValue() {
      if (!appBackupHiddenInput || !appBackupVisibleInput) {
        return;
      }

      appBackupHiddenInput.value = appBackupVisibleInput.value;
    }

    appBackupVisibleInput?.addEventListener("input", syncBackupJsonValue);

    appBackupFileInput?.addEventListener("change", async () => {
      const file = appBackupFileInput.files?.[0] || null;

      if (!file || !appBackupVisibleInput || !appBackupHiddenInput) {
        return;
      }

      try {
        const text = await file.text();
        appBackupVisibleInput.value = text;
        appBackupHiddenInput.value = text;

        if (appBackupFileStatus) {
          appBackupFileStatus.textContent = `Loaded ${file.name}.`;
        }
      } catch (error) {
        if (appBackupFileStatus) {
          appBackupFileStatus.textContent = "Unable to read that backup file.";
        }
      }
    });

    appBackupForm?.addEventListener("submit", (event) => {
      syncBackupJsonValue();

      if (!String(appBackupHiddenInput?.value || "").trim()) {
        event.preventDefault();
        InventoryUi.showFlashFeedback?.("error", "Choose a backup file or paste backup JSON before importing.");
        return;
      }

      if (!window.confirm("Import this full backup and replace all current app data?")) {
        event.preventDefault();
      }
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
      enterViewMode();
      currentRoleId = null;
      currentRoleIsSystem = false;
    });

    document.getElementById("manage-app-backup-modal")?.addEventListener("modal:close", () => {
      appBackupForm?.reset();
      if (appBackupVisibleInput) {
        appBackupVisibleInput.value = "";
      }
      if (appBackupHiddenInput) {
        appBackupHiddenInput.value = "";
      }
      if (appBackupFileStatus) {
        appBackupFileStatus.textContent = "Choose a JSON backup file exported from the admin panel, or paste the backup text below.";
      }
    });
  });
}());
