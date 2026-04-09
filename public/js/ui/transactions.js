// Manages transaction item selection, quantity changes, and running totals.
(function initTransactionUi() {
  const InventoryUi = window.InventoryUi || {};

  InventoryUi.onReady(() => {
    const selectedItemsBody = document.getElementById("selected-items-body");
    const noSelectedItemsRow = document.getElementById("no-selected-items-row");
    const transactionTotal = document.getElementById("transaction-total");
    const transactionForm = document.getElementById("transaction-form");
    const paymentModal = document.getElementById("transaction-payment-modal");
    const paymentModalTotal = document.getElementById("payment-modal-total");
    const paymentCashInput = document.getElementById("payment-cash-input");
    const paymentChange = document.getElementById("payment-modal-change");
    const paymentMessage = document.getElementById("payment-modal-message");
    const confirmTransactionButton = document.getElementById("confirm-transaction-button");

    if (!selectedItemsBody || !transactionTotal) {
      return;
    }

    let isSubmittingTransaction = false;

    // Reads the numeric total displayed in the transaction summary.
    function getTransactionTotalValue() {
      return Number(transactionTotal.textContent || 0);
    }

    // Updates payment modal totals, change due, and submit eligibility.
    function updatePaymentSummary() {
      if (!paymentModalTotal || !paymentCashInput || !paymentChange || !paymentMessage || !confirmTransactionButton) {
        return true;
      }

      const total = getTransactionTotalValue();
      const cash = Number(paymentCashInput.value || 0);
      const change = cash - total;
      const hasItems = selectedItemsBody.querySelectorAll(".selected-item-row").length > 0;
      const hasEnoughCash = cash >= total;

      paymentModalTotal.textContent = total.toFixed(2);
      paymentChange.textContent = Math.max(change, 0).toFixed(2);

      if (!hasItems) {
        paymentMessage.textContent = "Select at least one item before completing the transaction.";
      } else if (cash <= 0) {
        paymentMessage.textContent = "Enter the cash received from the customer.";
      } else if (!hasEnoughCash) {
        paymentMessage.textContent = `Insufficient cash. Need PHP ${(total - cash).toFixed(2)} more.`;
      } else {
        paymentMessage.textContent = "";
      }

      confirmTransactionButton.disabled = !hasItems || cash <= 0 || !hasEnoughCash;
      return hasItems && cash > 0 && hasEnoughCash;
    }

    // Recalculates line subtotals and the overall transaction total.
    function updateTransactionTotal() {
      let total = 0;

      selectedItemsBody.querySelectorAll(".selected-item-row").forEach((row) => {
        const price = Number(row.querySelector(".selected-item-price")?.value || 0);
        const qty = Number(row.querySelector(".selected-item-qty")?.value || 0);
        const subtotal = price * qty;
        const subtotalCell = row.querySelector(".selected-item-subtotal");

        if (subtotalCell) {
          subtotalCell.textContent = subtotal.toFixed(2);
        }

        total += subtotal;
      });

      transactionTotal.textContent = total.toFixed(2);
      updatePaymentSummary();
    }

    // Updates an inventory button after stock changes from a completed transaction.
    function updateStockState(itemId, quantity) {
      const button = document.querySelector(`.add-transaction-item-button[data-id="${itemId}"]`);
      if (!button) return;

      button.dataset.stock = String(quantity);
      button.disabled = quantity <= 0;
      button.textContent = quantity <= 0 ? "Out of Stock" : "Select";
      button.classList.toggle("bg-slate-300", quantity <= 0);
      button.classList.toggle("text-slate-600", quantity <= 0);
      button.classList.toggle("cursor-not-allowed", quantity <= 0);
      button.classList.toggle("bg-sky-600", quantity > 0);
      button.classList.toggle("text-white", quantity > 0);
    }

    // Clears all selected checkout rows and refreshes the summary state.
    function resetTransactionBuilder() {
      selectedItemsBody.querySelectorAll(".selected-item-row").forEach((row) => row.remove());
      toggleSelectedItemsEmptyState();
      updateTransactionTotal();
    }

    // Submits the transaction asynchronously and applies the server response.
    async function submitTransaction() {
      if (!transactionForm) return;

      const formData = new FormData(transactionForm);
      const body = new URLSearchParams();
      for (const [key, value] of formData.entries()) {
        body.append(key, String(value));
      }

      confirmTransactionButton.disabled = true;

      try {
        const response = await fetch(transactionForm.action, {
          method: transactionForm.method,
          headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest"
          },
          body: body.toString()
        });
        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          InventoryUi.showFlashFeedback?.("error", payload.message || "Transaction failed.");
          return;
        }

        (payload.items || []).forEach((item) => {
          updateStockState(item.id, Number(item.quantity || 0));
        });

        InventoryUi.closeModal?.(paymentModal);
        resetTransactionBuilder();
        InventoryUi.showFlashFeedback?.("success", payload.message || "Transaction completed.");
      } catch (error) {
        InventoryUi.showFlashFeedback?.("error", "Transaction failed.");
      } finally {
        paymentCashInput.value = "";
        isSubmittingTransaction = false;
        updatePaymentSummary();
      }
    }

    // Shows or hides the empty-state row for the selected items table.
    function toggleSelectedItemsEmptyState() {
      if (!noSelectedItemsRow) return;

      noSelectedItemsRow.classList.toggle(
        "hidden",
        selectedItemsBody.querySelectorAll(".selected-item-row").length > 0
      );
    }

    // Attaches quantity and remove handlers to a selected transaction row.
    function bindSelectedItemEvents(row) {
      const qtyInput = row.querySelector(".selected-item-qty");
      const removeButton = row.querySelector(".remove-selected-item-button");

      if (qtyInput) {
        qtyInput.addEventListener("input", () => {
          const max = Number(qtyInput.max || qtyInput.value || 1);
          let nextValue = Number(qtyInput.value || 1);

          if (nextValue < 1) nextValue = 1;
          if (nextValue > max) nextValue = max;

          qtyInput.value = String(nextValue);
          updateTransactionTotal();
        });
      }

      if (removeButton) {
        removeButton.addEventListener("click", () => {
          row.remove();
          toggleSelectedItemsEmptyState();
          updateTransactionTotal();
        });
      }
    }

    document.querySelectorAll(".add-transaction-item-button").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.id;
        const barcode = button.dataset.barcode;
        const name = button.dataset.name;
        const price = Number(button.dataset.price || 0);
        const stock = Number(button.dataset.stock || 0);

        if (stock <= 0) {
          InventoryUi.openModal?.("out-of-stock-modal");
          return;
        }

        const existingRow = selectedItemsBody.querySelector(`.selected-item-row[data-id="${id}"]`);
        if (existingRow) {
          const qtyInput = existingRow.querySelector(".selected-item-qty");
          if (qtyInput) {
            qtyInput.value = String(Math.min(Number(qtyInput.value || 1) + 1, stock));
            updateTransactionTotal();
          }
          return;
        }

        const row = document.createElement("tr");
        row.className = "selected-item-row border-b border-slate-200";
        row.dataset.id = id;
        row.innerHTML = `
          <td data-label="Item" class="px-4 py-3 align-top">
            <div class="font-semibold text-slate-900">${barcode}</div>
            <div class="text-xs text-slate-500">${name}</div>
            <input type="hidden" name="item_id" value="${id}">
            <input type="hidden" name="price" value="${price}" class="selected-item-price">
          </td>
          <td data-label="Price" class="px-4 py-3 text-slate-700">${price.toFixed(2)}</td>
          <td data-label="Qty" class="px-4 py-3">
            <input type="number" name="quantity" value="1" min="1" max="${stock}" class="selected-item-qty w-20 rounded-xl border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200">
          </td>
          <td data-label="Subtotal" class="px-4 py-3 text-slate-700">PHP <span class="selected-item-subtotal">${price.toFixed(2)}</span></td>
          <td data-label="Remove" class="px-4 py-3">
            <button type="button" class="remove-selected-item-button w-full rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 sm:w-auto">Remove</button>
          </td>
        `;

        selectedItemsBody.appendChild(row);
        bindSelectedItemEvents(row);
        toggleSelectedItemsEmptyState();
        updateTransactionTotal();
      });
    });

    paymentModal?.addEventListener("modal:open", () => {
      if (!paymentCashInput) return;

      paymentCashInput.value = "";
      updatePaymentSummary();
      paymentCashInput.focus();
    });

    paymentCashInput?.addEventListener("input", () => {
      updatePaymentSummary();
    });

    confirmTransactionButton?.addEventListener("click", () => {
      if (!transactionForm || !updatePaymentSummary()) return;

      isSubmittingTransaction = true;
      transactionForm.requestSubmit();
    });

    transactionForm?.addEventListener("submit", async (event) => {
      if (isSubmittingTransaction) {
        event.preventDefault();
        await submitTransaction();
        return;
      }

      event.preventDefault();
      updatePaymentSummary();
      InventoryUi.openModal?.("transaction-payment-modal");
    });

    toggleSelectedItemsEmptyState();
    updateTransactionTotal();
  });
}());