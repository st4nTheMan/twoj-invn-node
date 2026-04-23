// Handles admin-panel actions that need to populate shared modals dynamically.
(function initAdminUi() {
  const InventoryUi = window.InventoryUi || {};

  InventoryUi.onReady(() => {
    if (window.location.pathname !== "/admin") {
      return;
    }

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
    
    let currentUserId = null;
    let currentUserRole = null;

    // Populates the view-user modal with the selected user's details.
    document.querySelectorAll("[data-view-user-trigger]").forEach((button) => {
      button.addEventListener("click", () => {
        const userId = button.dataset.userId || "0";
        const username = button.dataset.username || "User";
        const roleDisplay = button.dataset.roleDisplay || "—";
        const roleName = button.dataset.roleName || "";
        const createdAt = button.dataset.createdAt || "";

        currentUserId = userId;
        currentUserRole = roleName;

        const usernameTitle = document.getElementById("view-user-modal-username");
        const roleSubtitle = document.getElementById("view-user-modal-role");
        const usernameDisplay = document.getElementById("view-user-modal-username-display");
        const roleDisplay_ = document.getElementById("view-user-modal-role-display");
        const roleSelect = document.getElementById("view-user-modal-role-select");
        const createdAtDisplay = document.getElementById("view-user-modal-created-at");
        const resetForm = document.getElementById("view-user-reset-password-form");

        if (usernameTitle) usernameTitle.textContent = username;
        if (roleSubtitle) roleSubtitle.textContent = roleDisplay;
        if (usernameDisplay) usernameDisplay.textContent = username;
        if (roleDisplay_) roleDisplay_.textContent = roleDisplay;

        // Pre-select the current role in the dropdown.
        if (roleSelect) {
          Array.from(roleSelect.options).forEach((opt) => {
            opt.selected = opt.value === roleName;
          });
        }

        if (createdAtDisplay) {
          const normalized = String(createdAt).trim().replace(" ", "T");
          const iso = normalized.endsWith("Z") || normalized.includes("+") ? normalized : `${normalized}Z`;
          const date = new Date(iso);
          createdAtDisplay.textContent = isNaN(date.getTime()) ? "—" : date.toLocaleString("en-PH", {
            weekday: "short", year: "numeric", month: "short",
            day: "2-digit", hour: "2-digit", minute: "2-digit",
            second: "2-digit", hour12: true, timeZone: "Asia/Manila"
          });
        }

        if (resetForm) {
          resetForm.action = `/admin/users/${encodeURIComponent(userId)}/password`;
          resetForm.reset();
          resetForm.classList.add("hidden");
        }

        // Reset to read-only mode.
        enterUserViewMode();
      });
    });

    function enterUserViewMode() {
      const roleDisplay = document.getElementById("view-user-modal-role-display");
      const roleSelect = document.getElementById("view-user-modal-role-select");
      const editButton = document.getElementById("view-user-edit-button");
      const saveButton = document.getElementById("view-user-save-role-button");
      const cancelButton = document.getElementById("view-user-cancel-edit-button");
      const statusEl = document.getElementById("view-user-edit-status");

      if (roleDisplay) roleDisplay.classList.remove("hidden");
      if (roleSelect) roleSelect.classList.add("hidden");
      if (editButton) editButton.classList.remove("hidden");
      if (saveButton) saveButton.classList.add("hidden");
      if (cancelButton) cancelButton.classList.add("hidden");
      if (statusEl) statusEl.className = "mt-4 hidden rounded-2xl border px-4 py-3 text-sm";
    }

    function enterUserEditMode() {
      const roleDisplay = document.getElementById("view-user-modal-role-display");
      const roleSelect = document.getElementById("view-user-modal-role-select");
      const editButton = document.getElementById("view-user-edit-button");
      const saveButton = document.getElementById("view-user-save-role-button");
      const cancelButton = document.getElementById("view-user-cancel-edit-button");

      if (roleDisplay) roleDisplay.classList.add("hidden");
      if (roleSelect) roleSelect.classList.remove("hidden");
      if (editButton) editButton.classList.add("hidden");
      if (saveButton) saveButton.classList.remove("hidden");
      if (cancelButton) cancelButton.classList.remove("hidden");
    }

    function setUserEditStatus(type, message) {
      const statusEl = document.getElementById("view-user-edit-status");
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

    document.getElementById("view-user-edit-button")?.addEventListener("click", enterUserEditMode);

    document.getElementById("view-user-cancel-edit-button")?.addEventListener("click", () => {
      // Restore original role in select.
      const roleSelect = document.getElementById("view-user-modal-role-select");
      if (roleSelect) {
        Array.from(roleSelect.options).forEach((opt) => {
          opt.selected = opt.value === currentUserRole;
        });
      }
      enterUserViewMode();
    });

    document.getElementById("view-user-save-role-button")?.addEventListener("click", async () => {
      if (!currentUserId) return;

      const roleSelect = document.getElementById("view-user-modal-role-select");
      const selectedRole = roleSelect?.value;

      if (!selectedRole) {
        setUserEditStatus("error", "Choose a valid role.");
        return;
      }

      const saveButton = document.getElementById("view-user-save-role-button");
      if (saveButton) {
        saveButton.disabled = true;
        saveButton.classList.add("opacity-70", "cursor-not-allowed");
      }
      setUserEditStatus("", "");

      try {
        const body = new URLSearchParams({ role: selectedRole });
        const response = await fetch(`/admin/users/${encodeURIComponent(currentUserId)}/role`, {
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
          setUserEditStatus("error", payload.message || "Unable to save changes.");
          return;
        }

        // Update display.
        const roleDisplay = document.getElementById("view-user-modal-role-display");
        const roleSubtitle = document.getElementById("view-user-modal-role");
        if (roleDisplay) roleDisplay.textContent = payload.roleDisplayName;
        if (roleSubtitle) roleSubtitle.textContent = payload.roleDisplayName;

        // Update trigger button data so reopening shows new role.
        const triggerButton = document.querySelector(
          `[data-view-user-trigger][data-user-id="${currentUserId}"]`
        );
        if (triggerButton) {
          triggerButton.dataset.roleDisplay = payload.roleDisplayName;
          triggerButton.dataset.roleName = selectedRole;
        }

        // Update the role badge in the users table row.
        const tableRoleBadge = triggerButton?.closest("tr")?.querySelector("[data-role-badge]");
        if (tableRoleBadge) tableRoleBadge.textContent = payload.roleDisplayName;

        currentUserRole = selectedRole;
        enterUserViewMode();
        InventoryUi.showFlashFeedback?.("success", payload.message || "Role updated successfully.");
      } catch (error) {
        setUserEditStatus("error", "Unable to save changes right now.");
      } finally {
        if (saveButton) {
          saveButton.disabled = false;
          saveButton.classList.remove("opacity-70", "cursor-not-allowed");
        }
      }
    });

    // Show/hide reset password form.
    document.getElementById("view-user-show-password-button")?.addEventListener("click", () => {
      const form = document.getElementById("view-user-reset-password-form");
      const btn = document.getElementById("view-user-show-password-button");
      if (form) form.classList.remove("hidden");
      if (btn) btn.classList.add("hidden");
    });

    document.getElementById("view-user-cancel-password-button")?.addEventListener("click", () => {
      const form = document.getElementById("view-user-reset-password-form");
      const btn = document.getElementById("view-user-show-password-button");
      if (form) {
        form.classList.add("hidden");
        form.reset();
      }
      if (btn) btn.classList.remove("hidden");

      // Reset password toggles.
      document.querySelectorAll("#view-user-reset-password-form [data-password-toggle]").forEach((toggle) => {
        const targetId = toggle.dataset.target || "";
        const input = document.getElementById(targetId);
        if (input) input.type = "password";
        toggle.setAttribute("aria-pressed", "false");
        toggle.querySelector("[data-eye-open]")?.classList.remove("hidden");
        toggle.querySelector("[data-eye-closed]")?.classList.add("hidden");
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

    document.getElementById("view-user-modal")?.addEventListener("modal:close", () => {
      const usernameTitle = document.getElementById("view-user-modal-username");
      const roleSubtitle = document.getElementById("view-user-modal-role");
      const usernameDisplay = document.getElementById("view-user-modal-username-display");
      const roleDisplay = document.getElementById("view-user-modal-role-display");
      const createdAtDisplay = document.getElementById("view-user-modal-created-at");
      const resetForm = document.getElementById("view-user-reset-password-form");
      const showPasswordBtn = document.getElementById("view-user-show-password-button");

      if (usernameTitle) usernameTitle.textContent = "User";
      if (roleSubtitle) roleSubtitle.textContent = "—";
      if (usernameDisplay) usernameDisplay.textContent = "";
      if (roleDisplay) roleDisplay.textContent = "";
      if (createdAtDisplay) createdAtDisplay.textContent = "";
      if (resetForm) {
        resetForm.reset();
        resetForm.classList.add("hidden");
        resetForm.action = "/admin/users/0/password";
      }
      if (showPasswordBtn) showPasswordBtn.classList.remove("hidden");

      enterUserViewMode();
      currentUserId = null;
      currentUserRole = null;

      // Reset password toggles.
      document.querySelectorAll("#view-user-modal [data-password-toggle]").forEach((toggle) => {
        const targetId = toggle.dataset.target || "";
        const input = document.getElementById(targetId);
        if (input) input.type = "password";
        toggle.setAttribute("aria-pressed", "false");
        toggle.querySelector("[data-eye-open]")?.classList.remove("hidden");
        toggle.querySelector("[data-eye-closed]")?.classList.add("hidden");
      });
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
