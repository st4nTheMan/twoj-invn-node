// Controls the bulk adjustments page so only checked rows expose the active field.
(function initAdjustmentsUi() {
  const InventoryUi = window.InventoryUi || {};

  InventoryUi.onReady(() => {
    const root = document.getElementById("adjustments-page");
    if (!root) return;

    const modalId = "exclude-adjustment-row-modal";
    const typeInput = document.getElementById("adjustment-type");
    const saveButton = document.getElementById("adjustments-save-button");
    const modeButtons = root.querySelectorAll("[data-adjustment-mode]");
    const rows = root.querySelectorAll("[data-adjustment-row]");
    const confirmExcludeButton = document.getElementById("exclude-adjustment-row-confirm");
    const cancelExcludeButton = document.getElementById("exclude-adjustment-row-cancel");
    const modeLabels = {
      quantity: "OH QTY",
      min_max: "MIN/MAX QTY",
      cost: "COST",
      price: "PRICE",
      category: "CATEGORY"
    };
    let pendingRow = null;
    let suppressCheckboxChange = false;

    function getInputsForMode(row, mode) {
      return row.querySelectorAll(`[data-adjustment-input="${mode}"]`);
    }

    function getOriginalValue(input) {
      return String(input.dataset.originalValue || "");
    }

    function isInputEdited(input) {
      return String(input.value || "") !== getOriginalValue(input);
    }

    function isRowEdited(row) {
      return Array.from(row.querySelectorAll("[data-adjustment-input]")).some(isInputEdited);
    }

    function resetRowValues(row) {
      row.querySelectorAll("[data-adjustment-input]").forEach((input) => {
        input.value = getOriginalValue(input);
      });
    }

    function setRowChecked(row, checked) {
      const checkbox = row.querySelector("[data-adjustment-checkbox]");
      if (!checkbox) return;

      suppressCheckboxChange = true;
      checkbox.checked = checked;
      suppressCheckboxChange = false;
    }

    function closeExcludeModal() {
      if (InventoryUi.closeModal) {
        InventoryUi.closeModal(document.getElementById(modalId));
      }
    }

    function handleUncheck(row) {
      if (isRowEdited(row)) {
        pendingRow = row;

        if (InventoryUi.openModal) {
          InventoryUi.openModal(modalId);
        }

        return;
      }

      resetRowValues(row);
      syncAllRows();
    }

    function syncRow(row) {
      const checkbox = row.querySelector("[data-adjustment-checkbox]");
      const isChecked = Boolean(checkbox && checkbox.checked);
      const currentMode = typeInput.value;

      row.classList.toggle("bg-amber-50", isChecked);

      row.querySelectorAll("[data-adjustment-input]").forEach((input) => {
        input.disabled = true;
        input.classList.add("cursor-not-allowed", "bg-slate-100", "text-slate-400");
        input.classList.remove("bg-white", "text-slate-900");
      });

      getInputsForMode(row, currentMode).forEach((input) => {
        input.disabled = !isChecked;
        input.classList.toggle("cursor-not-allowed", !isChecked);
        input.classList.toggle("bg-slate-100", !isChecked);
        input.classList.toggle("text-slate-400", !isChecked);
        input.classList.toggle("bg-white", isChecked);
        input.classList.toggle("text-slate-900", isChecked);
      });
    }

    function syncAllRows() {
      let checkedCount = 0;

      rows.forEach((row) => {
        const checkbox = row.querySelector("[data-adjustment-checkbox]");
        if (checkbox && checkbox.checked) {
          checkedCount += 1;
        }

        syncRow(row);
      });

      if (saveButton) {
        saveButton.disabled = checkedCount === 0;
        saveButton.classList.toggle("opacity-50", checkedCount === 0);
        saveButton.classList.toggle("cursor-not-allowed", checkedCount === 0);
      }
    }

    function setMode(mode) {
      typeInput.value = mode;

      modeButtons.forEach((button) => {
        const isActive = button.dataset.adjustmentMode === mode;
        button.classList.toggle("bg-slate-950", isActive);
        button.classList.toggle("text-white", isActive);
        button.classList.toggle("border-slate-950", isActive);
        button.classList.toggle("border-slate-200", !isActive);
        button.classList.toggle("bg-white", !isActive);
        button.classList.toggle("text-slate-700", !isActive);
      });

      root.querySelectorAll("[data-adjustment-cell]").forEach((cell) => {
        const shouldShow = cell.dataset.adjustmentCell === mode;
        cell.classList.toggle("hidden", !shouldShow);
      });

      const title = root.querySelector("[data-adjustment-title]");
      if (title) {
        title.textContent = `Active adjustment: ${modeLabels[mode] || mode.toUpperCase()}`;
      }

      syncAllRows();
    }

    modeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        setMode(button.dataset.adjustmentMode);
      });
    });

    rows.forEach((row) => {
      const checkbox = row.querySelector("[data-adjustment-checkbox]");
      if (!checkbox) return;

      row.addEventListener("click", (event) => {
        const interactiveElement = event.target.closest("input, select, button, a, label");

        if (interactiveElement) {
          return;
        }

        const nextCheckedState = !checkbox.checked;
        setRowChecked(row, nextCheckedState);

        if (!nextCheckedState) {
          handleUncheck(row);
          return;
        }

        syncAllRows();
      });

      checkbox.addEventListener("change", () => {
        if (suppressCheckboxChange) {
          return;
        }

        if (!checkbox.checked) {
          handleUncheck(row);
          return;
        }

        syncAllRows();
      });

    });

    if (confirmExcludeButton) {
      confirmExcludeButton.addEventListener("click", () => {
        if (!pendingRow) return;

        resetRowValues(pendingRow);
        setRowChecked(pendingRow, false);
        syncAllRows();
        pendingRow = null;
        closeExcludeModal();
      });
    }

    if (cancelExcludeButton) {
      cancelExcludeButton.addEventListener("click", () => {
        if (pendingRow) {
          setRowChecked(pendingRow, true);
          syncAllRows();
        }

        pendingRow = null;
        closeExcludeModal();
      });
    }

    document.getElementById(modalId)?.addEventListener("modal:close", () => {
      if (!pendingRow) return;

      setRowChecked(pendingRow, true);
      syncAllRows();
      pendingRow = null;
    });

    setMode(typeInput.value || "quantity");
  });
}());
