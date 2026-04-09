// Controls the bulk adjustments page so only checked rows expose the active field.
(function initAdjustmentsUi() {
  const InventoryUi = window.InventoryUi || {};

  InventoryUi.onReady(() => {
    const root = document.getElementById("adjustments-page");
    if (!root) return;

    const modalId = "exclude-adjustment-row-modal";
    const form = document.getElementById("adjustments-form");
    const typeInput = document.getElementById("adjustment-type");
    const adjustmentsJsonInput = document.getElementById("adjustments-json");
    const saveButton = document.getElementById("adjustments-save-button");
    const modeButtons = root.querySelectorAll("[data-adjustment-mode]");
    const rows = root.querySelectorAll("[data-adjustment-row]");
    const confirmExcludeButton = document.getElementById("exclude-adjustment-row-confirm");
    const cancelExcludeButton = document.getElementById("exclude-adjustment-row-cancel");
    const excludeMessage = document.getElementById("exclude-adjustment-row-message");
    const modeLabels = {
      quantity: "OH QTY",
      min_max: "MIN/MAX QTY",
      cost: "COST",
      price: "PRICE",
      category: "CATEGORY"
    };
    let pendingRow = null;
    let pendingMode = null;
    let suppressCheckboxChange = false;

    function setSaveButtonDisabled(disabled) {
      if (!saveButton) return;

      saveButton.disabled = disabled;
      saveButton.classList.toggle("opacity-50", disabled);
      saveButton.classList.toggle("cursor-not-allowed", disabled);
    }

    function getInputsForMode(row, mode) {
      return row.querySelectorAll(`[data-adjustment-input="${mode}"]`);
    }

    function buildRowPayload(row) {
      const checkbox = row.querySelector("[data-adjustment-checkbox]");
      if (!checkbox || !checkbox.checked) return null;

      const itemId = Number(checkbox.value);
      const currentMode = typeInput.value;

      if (!Number.isInteger(itemId) || itemId <= 0) {
        return null;
      }

      if (currentMode === "quantity") {
        const input = row.querySelector('[data-adjustment-input="quantity"]');
        const rawValue = input ? String(input.value || "").trim() : "";
        return { item_id: itemId, quantity: rawValue };
      }

      if (currentMode === "min_max") {
        const inputs = row.querySelectorAll('[data-adjustment-input="min_max"]');
        const minValue = inputs[0] ? String(inputs[0].value || "").trim() : "";
        const maxValue = inputs[1] ? String(inputs[1].value || "").trim() : "";
        return {
          item_id: itemId,
          min_quantity: minValue,
          max_quantity: maxValue
        };
      }

      if (currentMode === "cost") {
        const input = row.querySelector('[data-adjustment-input="cost"]');
        const rawValue = input ? String(input.value || "").trim() : "";
        return { item_id: itemId, cost: rawValue };
      }

      if (currentMode === "price") {
        const input = row.querySelector('[data-adjustment-input="price"]');
        const rawValue = input ? String(input.value || "").trim() : "";
        return { item_id: itemId, price: rawValue };
      }

      if (currentMode === "category") {
        const select = row.querySelector('[data-adjustment-input="category"]');
        const rawValue = select ? String(select.value || "").trim() : "";
        return { item_id: itemId, category_id: rawValue };
      }

      return null;
    }

    function syncCategoryHiddenValue(row) {
      const select = row.querySelector('[data-adjustment-input="category"]');
      const hiddenInput = row.querySelector('[data-adjustment-hidden="category"]');

      if (!select || !hiddenInput) return;

      hiddenInput.value = select.value;
    }

    function syncHiddenValue(row, inputType, hiddenType = inputType, inputIndex = 0) {
      const inputs = row.querySelectorAll(`[data-adjustment-input="${inputType}"]`);
      const input = inputs[inputIndex];
      const hiddenInput = row.querySelector(`[data-adjustment-hidden="${hiddenType}"]`);

      if (!input || !hiddenInput) return;

      hiddenInput.value = input.value;
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

    function isRowEditedForMode(row, mode) {
      return Array.from(getInputsForMode(row, mode)).some(isInputEdited);
    }

    function hasEditedCheckedRowsForMode(mode) {
      return Array.from(rows).some((row) => {
        const checkbox = row.querySelector("[data-adjustment-checkbox]");
        return Boolean(checkbox?.checked) && isRowEditedForMode(row, mode);
      });
    }

    function resetRowValues(row) {
      row.querySelectorAll("[data-adjustment-input]").forEach((input) => {
        input.value = getOriginalValue(input);
      });

      row.querySelectorAll("[data-adjustment-hidden]").forEach((input) => {
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

    function openDiscardModal(message) {
      if (excludeMessage) {
        excludeMessage.textContent = message;
      }

      if (InventoryUi.openModal) {
        InventoryUi.openModal(modalId);
      }
    }

    function handleUncheck(row) {
      if (isRowEdited(row)) {
        pendingRow = row;
        pendingMode = null;
        openDiscardModal("Are you sure you want to exclude this edited row or item?");

        return;
      }

      resetRowValues(row);
      syncAllRows();
    }

    function discardCheckedRowsForMode(mode) {
      rows.forEach((row) => {
        const checkbox = row.querySelector("[data-adjustment-checkbox]");

        if (!checkbox?.checked) {
          return;
        }

        if (isRowEditedForMode(row, mode)) {
          resetRowValues(row);
        }

        setRowChecked(row, false);
      });
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
        saveButton.classList.toggle("opacity-50", checkedCount === 0);
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
        const nextMode = button.dataset.adjustmentMode;

        if (nextMode === typeInput.value) {
          return;
        }

        if (hasEditedCheckedRowsForMode(typeInput.value)) {
          pendingRow = null;
          pendingMode = nextMode;
          openDiscardModal(`Are you sure you want to discard the edited rows from ${modeLabels[typeInput.value]}?`);
          return;
        }

        setMode(nextMode);
      });
    });

    rows.forEach((row) => {
      const checkbox = row.querySelector("[data-adjustment-checkbox]");
      if (!checkbox) return;

      row.addEventListener("click", (event) => {
        const interactiveElement = event.target.closest("input, select, option, button, a, label, [data-adjustment-input]");
        const toggleCell = event.target.closest("[data-adjustment-row-toggle]");

        if (interactiveElement || !toggleCell) {
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

      const categorySelect = row.querySelector('[data-adjustment-input="category"]');
      if (categorySelect) {
        categorySelect.addEventListener("change", () => {
          syncCategoryHiddenValue(row);
        });
      }

      const quantityInput = row.querySelector('[data-adjustment-input="quantity"]');
      if (quantityInput) {
        quantityInput.addEventListener("input", () => {
          syncHiddenValue(row, "quantity");
        });
      }

      const minMaxInputs = row.querySelectorAll('[data-adjustment-input="min_max"]');
      if (minMaxInputs[0]) {
        minMaxInputs[0].addEventListener("input", () => {
          syncHiddenValue(row, "min_max", "min_quantity", 0);
        });
      }

      if (minMaxInputs[1]) {
        minMaxInputs[1].addEventListener("input", () => {
          syncHiddenValue(row, "min_max", "max_quantity", 1);
        });
      }

      const costInput = row.querySelector('[data-adjustment-input="cost"]');
      if (costInput) {
        costInput.addEventListener("input", () => {
          syncHiddenValue(row, "cost");
        });
      }

      const priceInput = row.querySelector('[data-adjustment-input="price"]');
      if (priceInput) {
        priceInput.addEventListener("input", () => {
          syncHiddenValue(row, "price");
        });
      }

      syncHiddenValue(row, "quantity");
      syncHiddenValue(row, "min_max", "min_quantity", 0);
      syncHiddenValue(row, "min_max", "max_quantity", 1);
      syncHiddenValue(row, "cost");
      syncHiddenValue(row, "price");
      syncCategoryHiddenValue(row);

    });

    if (form) {
      form.addEventListener("submit", () => {
        rows.forEach((row) => {
          syncHiddenValue(row, "quantity");
          syncHiddenValue(row, "min_max", "min_quantity", 0);
          syncHiddenValue(row, "min_max", "max_quantity", 1);
          syncHiddenValue(row, "cost");
          syncHiddenValue(row, "price");
          syncCategoryHiddenValue(row);
        });
      });
    }

    function updateCurrentSummary(row, item) {
      const currentCell = row.querySelector("[data-adjustment-current]");
      if (!currentCell || !item) return;

      currentCell.innerHTML = [
        `OH: ${Number(item.quantity || 0)}`,
        `Min/Max: ${Number(item.min_quantity || 0)}/${Number(item.max_quantity || 0)}`,
        `Cost: PHP ${Number(item.cost || 0).toFixed(2)}`,
        `Price: PHP ${Number(item.price || 0).toFixed(2)}`
      ].join("<br>");
    }

    function applyUpdatedItem(row, item) {
      if (!row || !item) return;

      const quantityHidden = row.querySelector('[data-adjustment-hidden="quantity"]');
      const minHidden = row.querySelector('[data-adjustment-hidden="min_quantity"]');
      const maxHidden = row.querySelector('[data-adjustment-hidden="max_quantity"]');
      const costHidden = row.querySelector('[data-adjustment-hidden="cost"]');
      const priceHidden = row.querySelector('[data-adjustment-hidden="price"]');
      const categoryHidden = row.querySelector('[data-adjustment-hidden="category"]');
      const quantityInput = row.querySelector('[data-adjustment-input="quantity"]');
      const minMaxInputs = row.querySelectorAll('[data-adjustment-input="min_max"]');
      const costInput = row.querySelector('[data-adjustment-input="cost"]');
      const priceInput = row.querySelector('[data-adjustment-input="price"]');
      const categoryInput = row.querySelector('[data-adjustment-input="category"]');
      const categoryCell = row.querySelector('[data-label="Category"]');

      if (quantityHidden) {
        quantityHidden.value = String(item.quantity ?? 0);
        quantityHidden.dataset.originalValue = String(item.quantity ?? 0);
      }
      if (quantityInput) {
        quantityInput.value = String(item.quantity ?? 0);
        quantityInput.dataset.originalValue = String(item.quantity ?? 0);
      }

      if (minHidden) {
        minHidden.value = String(item.min_quantity ?? 0);
        minHidden.dataset.originalValue = String(item.min_quantity ?? 0);
      }
      if (minMaxInputs[0]) {
        minMaxInputs[0].value = String(item.min_quantity ?? 0);
        minMaxInputs[0].dataset.originalValue = String(item.min_quantity ?? 0);
      }

      if (maxHidden) {
        maxHidden.value = String(item.max_quantity ?? 0);
        maxHidden.dataset.originalValue = String(item.max_quantity ?? 0);
      }
      if (minMaxInputs[1]) {
        minMaxInputs[1].value = String(item.max_quantity ?? 0);
        minMaxInputs[1].dataset.originalValue = String(item.max_quantity ?? 0);
      }

      if (costHidden) {
        costHidden.value = String(item.cost ?? 0);
        costHidden.dataset.originalValue = String(item.cost ?? 0);
      }
      if (costInput) {
        costInput.value = String(item.cost ?? 0);
        costInput.dataset.originalValue = String(item.cost ?? 0);
      }

      if (priceHidden) {
        priceHidden.value = String(item.price ?? 0);
        priceHidden.dataset.originalValue = String(item.price ?? 0);
      }
      if (priceInput) {
        priceInput.value = String(item.price ?? 0);
        priceInput.dataset.originalValue = String(item.price ?? 0);
      }

      if (categoryHidden) {
        categoryHidden.value = String(item.category_id ?? "");
        categoryHidden.dataset.originalValue = String(item.category_id ?? "");
      }
      if (categoryInput) {
        categoryInput.value = String(item.category_id ?? "");
        categoryInput.dataset.originalValue = String(item.category_id ?? "");
      }
      if (categoryCell) {
        categoryCell.textContent = item.category_name || "No Category";
      }

      updateCurrentSummary(row, item);
      setRowChecked(row, false);
    }

    async function submitAdjustments() {
      if (!form || !adjustmentsJsonInput) {
        return;
      }

      const formData = new FormData(form);
      const body = new URLSearchParams();
      for (const [key, value] of formData.entries()) {
        body.append(key, String(value));
      }

      setSaveButtonDisabled(true);

      try {
        const response = await fetch(form.action, {
          method: form.method,
          headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest"
          },
          body: body.toString()
        });
        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          InventoryUi.showFlashFeedback?.("error", payload.message || "Unable to save adjustments right now.");
          return;
        }

        const updatedItems = new Map((payload.items || []).map((item) => [String(item.id), item]));
        rows.forEach((row) => {
          const rowItemId = row.dataset.itemId || row.querySelector("[data-adjustment-checkbox]")?.value;
          if (!rowItemId || !updatedItems.has(String(rowItemId))) return;
          applyUpdatedItem(row, updatedItems.get(String(rowItemId)));
        });

        syncAllRows();
        InventoryUi.showFlashFeedback?.("success", payload.message || "Selected items updated successfully.");
      } catch (error) {
        InventoryUi.showFlashFeedback?.("error", "Unable to save adjustments right now.");
      } finally {
        setSaveButtonDisabled(false);
      }
    }

    if (saveButton) {
      saveButton.addEventListener("click", async () => {
        const checkedRows = Array.from(rows).filter((row) => {
          const checkbox = row.querySelector("[data-adjustment-checkbox]");
          return Boolean(checkbox?.checked);
        });

        if (!checkedRows.length) {
          return;
        }

        checkedRows.forEach((row) => {
          syncHiddenValue(row, "quantity");
          syncHiddenValue(row, "min_max", "min_quantity", 0);
          syncHiddenValue(row, "min_max", "max_quantity", 1);
          syncHiddenValue(row, "cost");
          syncHiddenValue(row, "price");
          syncCategoryHiddenValue(row);
        });

        const adjustments = checkedRows
          .map((row) => buildRowPayload(row))
          .filter(Boolean);

        if (adjustmentsJsonInput) {
          adjustmentsJsonInput.value = JSON.stringify({
            adjustmentType: typeInput.value,
            adjustments
          });
        }

        await submitAdjustments();
      });
    }

    if (confirmExcludeButton) {
      confirmExcludeButton.addEventListener("click", () => {
        if (pendingRow) {
          resetRowValues(pendingRow);
          setRowChecked(pendingRow, false);
          syncAllRows();
          pendingRow = null;
          closeExcludeModal();
          return;
        }

        if (pendingMode) {
          discardCheckedRowsForMode(typeInput.value);
          syncAllRows();
          const nextMode = pendingMode;
          pendingMode = null;
          closeExcludeModal();
          setMode(nextMode);
          return;
        }

        closeExcludeModal();
      });
    }

    if (cancelExcludeButton) {
      cancelExcludeButton.addEventListener("click", () => {
        if (pendingRow) {
          setRowChecked(pendingRow, true);
          syncAllRows();
        }

        pendingMode = null;
        pendingRow = null;
        closeExcludeModal();
      });
    }

    document.getElementById(modalId)?.addEventListener("modal:close", () => {
      if (pendingRow) {
        setRowChecked(pendingRow, true);
        syncAllRows();
      }

      pendingMode = null;
      pendingRow = null;
    });

    setMode(typeInput.value || "quantity");
  });
}());
