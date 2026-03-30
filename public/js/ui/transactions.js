// Manages transaction item selection, quantity changes, and running totals.
(function initTransactionUi() {
  const InventoryUi = window.InventoryUi || {};

  InventoryUi.onReady(() => {
    const selectedItemsBody = document.getElementById("selected-items-body");
    const noSelectedItemsRow = document.getElementById("no-selected-items-row");
    const transactionTotal = document.getElementById("transaction-total");

    if (!selectedItemsBody || !transactionTotal) {
      return;
    }

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
    }

    function toggleSelectedItemsEmptyState() {
      if (!noSelectedItemsRow) return;

      noSelectedItemsRow.classList.toggle(
        "hidden",
        selectedItemsBody.querySelectorAll(".selected-item-row").length > 0
      );
    }

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
          <td class="px-4 py-3 align-top">
            <div class="font-semibold text-slate-900">${barcode}</div>
            <div class="text-xs text-slate-500">${name}</div>
            <input type="hidden" name="item_id" value="${id}">
            <input type="hidden" name="price" value="${price}" class="selected-item-price">
          </td>
          <td class="px-4 py-3 text-slate-700">${price.toFixed(2)}</td>
          <td class="px-4 py-3">
            <input type="number" name="quantity" value="1" min="1" max="${stock}" class="selected-item-qty w-20 rounded-xl border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200">
          </td>
          <td class="px-4 py-3 text-slate-700">PHP <span class="selected-item-subtotal">${price.toFixed(2)}</span></td>
          <td class="px-4 py-3">
            <button type="button" class="remove-selected-item-button rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50">Remove</button>
          </td>
        `;

        selectedItemsBody.appendChild(row);
        bindSelectedItemEvents(row);
        toggleSelectedItemsEmptyState();
        updateTransactionTotal();
      });
    });
  });
}());
