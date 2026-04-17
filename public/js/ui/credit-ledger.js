// Handles inventory item selection for manual credit-ledger entries.
(function initCreditLedgerUi() {
  const InventoryUi = window.InventoryUi || {};

  InventoryUi.onReady(() => {
    const form = document.getElementById("credit-ledger-form");
    const selectedItemsBody = document.getElementById("credit-ledger-selected-items-body");
    const noSelectedItemsRow = document.getElementById("credit-ledger-no-selected-items-row");
    const totalAmountInput = document.getElementById("credit-ledger-total-amount");
    const customerSelect = document.getElementById("credit-ledger-customer-select");
    const customerNameInput = document.getElementById("credit-ledger-customer-name");
    const customerPhoneInput = document.getElementById("credit-ledger-customer-phone");
    const customerPhoneHiddenInput = document.getElementById("credit-ledger-customer-phone-hidden");
    const settleBalanceModalId = "settle-credit-balance-modal";
    const settleBalanceMessage = document.getElementById("settle-credit-balance-message");
    const settleBalanceForm = document.getElementById("settle-credit-balance-form");
    const itemsModalId = "credit-ledger-items-modal";
    const itemsModalSubtitle = document.getElementById("credit-ledger-items-modal-subtitle");
    const itemsModalCustomer = document.getElementById("credit-ledger-items-modal-customer");
    const itemsModalTotal = document.getElementById("credit-ledger-items-modal-total");
    const itemsModalBody = document.getElementById("credit-ledger-items-modal-body");
    const itemCatalog = Array.isArray(window.creditLedgerItemCatalog) ? window.creditLedgerItemCatalog : [];
    const priceByBarcode = new Map(
      itemCatalog.map((item) => [String(item.barcode || "").trim(), Number(item.price || 0)])
    );

    if (!form || !selectedItemsBody || !totalAmountInput) {
      bindSettleBalanceModal();
      bindLedgerItemsModal();
      return;
    }

    function bindSettleBalanceModal() {
      document.querySelectorAll(".open-settle-credit-modal-button").forEach((button) => {
        button.addEventListener("click", () => {
          const customerId = String(button.dataset.customerId || "").trim();
          const customerName = String(button.dataset.customerName || "").trim() || "this customer";
          const balanceDue = Number(button.dataset.balanceDue || 0).toLocaleString("en-PH", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          });

          if (!customerId || !settleBalanceForm || !settleBalanceMessage) {
            return;
          }

          settleBalanceForm.action = `/credit-ledger/${encodeURIComponent(customerId)}/settle`;
          settleBalanceMessage.textContent = `Proceed with marking ${customerName}'s remaining balance of PHP ${balanceDue} as paid? The ledger records will stay available for tracing.`;
          InventoryUi.openModal?.(settleBalanceModalId);
        });
      });
    }

    function bindLedgerItemsModal() {
      document.querySelectorAll(".open-credit-ledger-items-modal-button").forEach((button) => {
        button.addEventListener("click", () => {
          if (!itemsModalBody || !itemsModalCustomer || !itemsModalTotal) {
            return;
          }

          const customerName = String(button.dataset.customerName || "").trim() || "Unknown customer";
          const totalAmount = Number(button.dataset.totalAmount || 0).toLocaleString("en-PH", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          });
          const rawSummary = String(button.dataset.itemSummary || "").trim();
          const summaryParts = rawSummary
            ? rawSummary.split(/\s*,\s*/).map((part) => part.trim()).filter(Boolean)
            : [];

          itemsModalCustomer.textContent = customerName;
          itemsModalTotal.textContent = totalAmount;

          if (itemsModalSubtitle) {
            itemsModalSubtitle.textContent = `Saved item details for ${customerName}'s ledger entry.`;
          }

          itemsModalBody.innerHTML = "";

          if (!summaryParts.length) {
            itemsModalBody.innerHTML = `
              <tr>
                <td colspan="4" class="px-4 py-6 text-center text-slate-500">No item summary available for this ledger entry.</td>
              </tr>
            `;
          } else {
            const formatMoney = (value) => Number(value || 0).toLocaleString("en-PH", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            });

            summaryParts.forEach((part) => {
              const matched = part.match(/^(.*?)\s*-\s*(.*?)\s*x(\d+(?:\.\d+)?)$/);
              const barcode = String(matched?.[1] || "").trim();
              const itemLabel = String(matched?.[2] || part).trim();
              const quantity = Math.max(1, Number(matched?.[3] || 1));
              const unitPrice = barcode ? priceByBarcode.get(barcode) : null;
              const subtotal = Number.isFinite(unitPrice) ? unitPrice * quantity : null;
              const row = document.createElement("tr");
              row.className = "border-b border-slate-200";
              row.innerHTML = `
                <td class="px-4 py-3 align-top text-slate-700">
                  <div class="font-medium text-slate-900">${itemLabel}</div>
                  <div class="text-xs text-slate-500">${barcode || "No barcode"}</div>
                </td>
                <td class="px-4 py-3 align-top text-slate-700">${quantity}</td>
                <td class="px-4 py-3 align-top text-slate-700">${subtotal === null ? "-" : `PHP ${formatMoney(unitPrice)}`}</td>
                <td class="px-4 py-3 align-top font-semibold text-slate-900">${subtotal === null ? "-" : `PHP ${formatMoney(subtotal)}`}</td>
              `;
              itemsModalBody.appendChild(row);
            });
          }

          InventoryUi.openModal?.(itemsModalId);
        });
      });
    }

    function normalizePhoneDigits(value) {
      return String(value || "").replace(/\D/g, "").slice(0, 10);
    }

    function syncSelectedCustomerUi() {
      const selectedOption = customerSelect?.options[customerSelect.selectedIndex] || null;
      const selectedCustomerId = String(customerSelect?.value || "").trim();
      const selectedCustomerName = selectedOption?.dataset.name || "";
      const selectedCustomerPhone = selectedOption?.dataset.phone || "";
      const phoneDigits = normalizePhoneDigits(selectedCustomerPhone);
      const hasSelectedCustomer = Boolean(selectedCustomerId);

      if (customerNameInput) {
        customerNameInput.readOnly = hasSelectedCustomer;
        customerNameInput.value = hasSelectedCustomer ? selectedCustomerName : customerNameInput.value;
        customerNameInput.classList.toggle("bg-slate-100", hasSelectedCustomer);
      }

      if (customerPhoneInput) {
        customerPhoneInput.readOnly = hasSelectedCustomer;
        customerPhoneInput.value = hasSelectedCustomer ? phoneDigits : normalizePhoneDigits(customerPhoneInput.value);
        customerPhoneInput.classList.toggle("bg-slate-100", hasSelectedCustomer);
      }

      return hasSelectedCustomer;
    }

    function syncCustomerPhone() {
      if (!customerPhoneInput || !customerPhoneHiddenInput) {
        return "";
      }

      const digits = normalizePhoneDigits(customerPhoneInput.value);
      customerPhoneInput.value = digits;
      customerPhoneHiddenInput.value = digits ? `+63${digits}` : "";
      return digits;
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
          <td data-label="Item" class="break-words px-4 py-3 align-top">
            <div class="font-semibold text-slate-900 break-all">${button.dataset.barcode || ""}</div>
            <div class="text-xs text-slate-500">${button.dataset.name || ""}</div>
            <input type="hidden" name="item_id" value="${id}" class="credit-ledger-selected-item-id">
            <input type="hidden" name="quantity" value="1" class="credit-ledger-selected-item-quantity">
          </td>
          <td data-label="Qty" class="w-28 px-4 py-3 align-top">
            <input type="number" min="1" value="1" class="credit-ledger-selected-item-qty w-full max-w-[6rem] rounded-xl border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200">
          </td>
          <td data-label="Remove" class="w-32 px-4 py-3 align-top">
            <button type="button" class="remove-credit-ledger-item-button w-full rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50">Remove</button>
          </td>
        `;

        selectedItemsBody.appendChild(row);
        bindRowEvents(row);
        updateItemSummary();
      });
    });

    form.addEventListener("submit", (event) => {
      updateItemSummary();
      const hasSelectedCustomer = syncSelectedCustomerUi();
      const phoneDigits = syncCustomerPhone();

      if (!selectedItemsBody.querySelector(".credit-ledger-selected-item-row")) {
        event.preventDefault();
        InventoryUi.showFlashFeedback?.("error", "Select at least one inventory item before saving the credit entry.");
        return;
      }

      if (!hasSelectedCustomer && !String(customerNameInput?.value || "").trim()) {
        event.preventDefault();
        InventoryUi.showFlashFeedback?.("error", "Choose a registered customer or enter a customer name.");
        return;
      }

      if (customerPhoneInput && phoneDigits.length !== 10) {
        event.preventDefault();
        InventoryUi.showFlashFeedback?.("error", "Enter a valid 10-digit phone number after +63.");
      }
    });

    customerSelect?.addEventListener("change", () => {
      syncSelectedCustomerUi();
      syncCustomerPhone();
    });

    customerNameInput?.addEventListener("input", () => {
      if (customerSelect?.value) {
        customerSelect.value = "";
      }
      syncSelectedCustomerUi();
    });

    customerPhoneInput?.addEventListener("input", () => {
      if (customerSelect?.value) {
        customerSelect.value = "";
      }
      syncSelectedCustomerUi();
      syncCustomerPhone();
    });

    document.getElementById("add-credit-ledger-modal")?.addEventListener("modal:open", () => {
      selectedItemsBody.querySelectorAll(".credit-ledger-selected-item-row").forEach((row) => row.remove());
      if (customerSelect) customerSelect.value = "";
      if (customerNameInput) customerNameInput.value = "";
      if (customerPhoneInput) customerPhoneInput.value = "";
      if (customerPhoneHiddenInput) customerPhoneHiddenInput.value = "";
      syncSelectedCustomerUi();
      updateItemSummary();
    });

    syncSelectedCustomerUi();
    syncCustomerPhone();
    updateItemSummary();
    bindSettleBalanceModal();
    bindLedgerItemsModal();
  });
}());
