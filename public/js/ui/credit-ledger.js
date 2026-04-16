// Handles inventory item selection for manual credit-ledger entries.
(function initCreditLedgerUi() {
  const InventoryUi = window.InventoryUi || {};

  InventoryUi.onReady(() => {
    const form = document.getElementById("credit-ledger-form");
    const selectedItemsBody = document.getElementById("credit-ledger-selected-items-body");
    const noSelectedItemsRow = document.getElementById("credit-ledger-no-selected-items-row");
    const totalAmountInput = document.getElementById("credit-ledger-total-amount");

    if (!form || !selectedItemsBody || !totalAmountInput) {
      return;
    }

    function toggleEmptyState() {
      if (!noSelectedItemsRow) return;

      noSelectedItemsRow.classList.toggle(
        "hidden",
        selectedItemsBody.querySelectorAll(".credit-ledger-selected-item-row").length > 0
      );
    }

    function updateItemSummary() {
      const parts = [];

      selectedItemsBody.querySelectorAll(".credit-ledger-selected-item-row").forEach((row) => {
        const qtyInput = row.querySelector(".credit-ledger-selected-item-qty");
        const qty = Math.max(1, Number(qtyInput?.value || 1));
        const name = row.dataset.name || "";
        const barcode = row.dataset.barcode || "";
        parts.push(`${barcode} - ${name} x${qty}`);
      });

      let totalAmount = 0;

      selectedItemsBody.querySelectorAll(".credit-ledger-selected-item-row").forEach((row) => {
        const qtyInput = row.querySelector(".credit-ledger-selected-item-qty");
        const itemIdInput = row.querySelector(".credit-ledger-selected-item-id");
        const quantityHiddenInput = row.querySelector(".credit-ledger-selected-item-quantity");
        const qty = Math.max(1, Number(qtyInput?.value || 1));
        const price = Number(row.dataset.price || 0);
        const name = row.dataset.name || "";
        const barcode = row.dataset.barcode || "";

        if (itemIdInput) {
          itemIdInput.value = row.dataset.id || "";
        }

        if (quantityHiddenInput) {
          quantityHiddenInput.value = String(qty);
        }

        parts.push(`${barcode} - ${name} x${qty}`);
        totalAmount += price * qty;
      });

      const summary = parts.join(", ");
      form.dataset.itemSummary = summary;
      totalAmountInput.value = totalAmount.toFixed(2);
      toggleEmptyState();
    }

    function bindRowEvents(row) {
      const qtyInput = row.querySelector(".credit-ledger-selected-item-qty");
      const removeButton = row.querySelector(".remove-credit-ledger-item-button");

      qtyInput?.addEventListener("input", () => {
        const nextValue = Math.max(1, Number(qtyInput.value || 1));
        qtyInput.value = String(nextValue);
        updateItemSummary();
      });

      removeButton?.addEventListener("click", () => {
        row.remove();
        updateItemSummary();
      });
    }

    document.querySelectorAll(".add-credit-ledger-item-button").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.id;
        const existingRow = selectedItemsBody.querySelector(`.credit-ledger-selected-item-row[data-id="${id}"]`);

        if (existingRow) {
          const qtyInput = existingRow.querySelector(".credit-ledger-selected-item-qty");
          if (qtyInput) {
            qtyInput.value = String(Math.max(1, Number(qtyInput.value || 1) + 1));
            updateItemSummary();
          }
          return;
        }

        const row = document.createElement("tr");
        row.className = "credit-ledger-selected-item-row border-b border-slate-200";
        row.dataset.id = id;
        row.dataset.name = button.dataset.name || "";
        row.dataset.barcode = button.dataset.barcode || "";
        row.dataset.price = button.dataset.price || "0";
        row.innerHTML = `
          <td data-label="Item" class="px-4 py-3 align-top">
            <div class="font-semibold text-slate-900">${button.dataset.barcode || ""}</div>
            <div class="text-xs text-slate-500">${button.dataset.name || ""}</div>
            <input type="hidden" name="item_id" value="${id}" class="credit-ledger-selected-item-id">
            <input type="hidden" name="quantity" value="1" class="credit-ledger-selected-item-quantity">
          </td>
          <td data-label="Qty" class="px-4 py-3">
            <input type="number" min="1" value="1" class="credit-ledger-selected-item-qty w-20 rounded-xl border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200">
          </td>
          <td data-label="Remove" class="px-4 py-3">
            <button type="button" class="remove-credit-ledger-item-button w-full rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 sm:w-auto">Remove</button>
          </td>
        `;

        selectedItemsBody.appendChild(row);
        bindRowEvents(row);
        updateItemSummary();
      });
    });

    form.addEventListener("submit", (event) => {
      updateItemSummary();

      if (!selectedItemsBody.querySelector(".credit-ledger-selected-item-row")) {
        event.preventDefault();
        InventoryUi.showFlashFeedback?.("error", "Select at least one inventory item before saving the credit entry.");
      }
    });

    document.getElementById("add-credit-ledger-modal")?.addEventListener("modal:open", () => {
      selectedItemsBody.querySelectorAll(".credit-ledger-selected-item-row").forEach((row) => row.remove());
      const customerName = document.getElementById("credit-ledger-customer-name");
      const customerPhone = document.getElementById("credit-ledger-customer-phone");
      if (customerName) customerName.value = "";
      if (customerPhone) customerPhone.value = "";
      updateItemSummary();
    });

    updateItemSummary();
  });
}());
