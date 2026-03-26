document.addEventListener("DOMContentLoaded", () => {
  const body = document.body;
  const pageState = document.getElementById("page-state");

  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove("hidden");
    body.classList.add("modal-open");
    modal.dispatchEvent(new CustomEvent("modal:open"));
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.add("hidden");
    modal.dispatchEvent(new CustomEvent("modal:close"));
    const openModals = document.querySelectorAll("[data-modal]:not(.hidden)");
    if (!openModals.length) body.classList.remove("modal-open");
  }

  document.querySelectorAll("[data-open-modal]").forEach((button) => {
    button.addEventListener("click", () => openModal(button.dataset.openModal));
  });

  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => closeModal(button.closest("[data-modal]")));
  });

  document.querySelectorAll("[data-modal]").forEach((modal) => {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModal(modal);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    document.querySelectorAll("[data-modal]:not(.hidden)").forEach((modal) => closeModal(modal));
  });

  if (pageState?.dataset.openModal) openModal(pageState.dataset.openModal);

  function bindSearch(inputId, tableId, emptyId) {
    const searchInput = document.getElementById(inputId);
    const table = document.getElementById(tableId);
    const emptyState = document.getElementById(emptyId);
    if (!searchInput || !table) return;

    const rows = table.querySelectorAll("tbody tr[data-row]");

    searchInput.addEventListener("input", () => {
      const searchValue = searchInput.value.toLowerCase().trim();
      let visibleCount = 0;

      rows.forEach((row) => {
        const matches = !searchValue || row.textContent.toLowerCase().includes(searchValue);
        row.classList.toggle("hidden", !matches);
        if (matches) visibleCount += 1;
      });

      if (emptyState) emptyState.classList.toggle("hidden", visibleCount !== 0);
    });
  }

  bindSearch("inventory-search", "inventory-table", "inventory-empty-search");
  bindSearch("transaction-search", "transaction-table", "transaction-empty-search");
  bindSearch("reports-search", "reports-table", "reports-empty-search");

  const addItemModal = document.getElementById("add-item-modal");
  const addBarcodeInput = document.getElementById("barcode");
  const viewBarcodeInput = document.getElementById("view_item_barcode");
  const openBarcodeScannerButton = document.getElementById("open-barcode-scanner");
  const openViewBarcodeScannerButton = document.getElementById("open-view-barcode-scanner");
  const barcodeScannerModal = document.getElementById("barcode-scanner-modal");
  const barcodeScannerViewport = document.getElementById("barcode-scanner-viewport");
  const barcodeScannerStatus = document.getElementById("barcode-scanner-status");

  let barcodeScannerActive = false;
  let barcodeDetectedHandler = null;
  let activeBarcodeInput = null;
  let returnModalId = null;

  function setBarcodeScannerStatus(message, isError = false) {
    if (!barcodeScannerStatus) return;
    barcodeScannerStatus.textContent = message;
    barcodeScannerStatus.className = isError
      ? "rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
      : "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600";
  }

  function stopBarcodeScanner() {
    if (!window.Quagga) return;

    if (barcodeDetectedHandler) {
      window.Quagga.offDetected(barcodeDetectedHandler);
      barcodeDetectedHandler = null;
    }

    if (!barcodeScannerActive) return;

    try {
      window.Quagga.stop();
    } catch (error) {
      console.error("Failed to stop barcode scanner.", error);
    }

    barcodeScannerActive = false;

    if (barcodeScannerViewport) {
      barcodeScannerViewport.innerHTML = "";
    }
  }

  function startBarcodeScanner(targetInput, modalIdToReturn = null) {
    if (!barcodeScannerModal || !barcodeScannerViewport || !targetInput) return;

    activeBarcodeInput = targetInput;
    returnModalId = modalIdToReturn;

    if (!window.Quagga) {
      setBarcodeScannerStatus("Barcode scanner failed to load. Please refresh the page and try again.", true);
      openModal("barcode-scanner-modal");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setBarcodeScannerStatus("This browser does not support camera scanning.", true);
      openModal("barcode-scanner-modal");
      return;
    }

    stopBarcodeScanner();
    setBarcodeScannerStatus("Starting camera...");
    openModal("barcode-scanner-modal");

    window.Quagga.init(
      {
        inputStream: {
          type: "LiveStream",
          target: barcodeScannerViewport,
          constraints: {
            facingMode: "environment"
          }
        },
        locator: {
          patchSize: "medium",
          halfSample: true
        },
        numOfWorkers: Math.max((navigator.hardwareConcurrency || 4) - 1, 1),
        decoder: {
          readers: [
            "code_128_reader",
            "ean_reader",
            "ean_8_reader",
            "upc_reader",
            "upc_e_reader"
          ]
        },
        locate: true
      },
      (error) => {
        if (error) {
          console.error("Failed to start barcode scanner.", error);
          setBarcodeScannerStatus("Unable to access the camera. Please allow camera access and try again.", true);
          return;
        }

        barcodeDetectedHandler = (result) => {
          const code = result?.codeResult?.code;
          if (!code || !activeBarcodeInput) return;

          activeBarcodeInput.value = code;
          activeBarcodeInput.dispatchEvent(new Event("input", { bubbles: true }));
          setBarcodeScannerStatus(`Scanned barcode: ${code}`);
          stopBarcodeScanner();
          closeModal(barcodeScannerModal);

          if (returnModalId) {
            openModal(returnModalId);
          }

          activeBarcodeInput.focus();
        };

        window.Quagga.onDetected(barcodeDetectedHandler);
        window.Quagga.start();
        barcodeScannerActive = true;
        setBarcodeScannerStatus("Camera is live. Hold the barcode steady inside the frame.");
      }
    );
  }

  if (openBarcodeScannerButton && addBarcodeInput) {
    openBarcodeScannerButton.addEventListener("click", () => {
      if (addItemModal) closeModal(addItemModal);
      startBarcodeScanner(addBarcodeInput, "add-item-modal");
    });
  }

  if (openViewBarcodeScannerButton && viewBarcodeInput) {
    openViewBarcodeScannerButton.addEventListener("click", () => {
      startBarcodeScanner(viewBarcodeInput, null);
    });
  }

  if (barcodeScannerModal) {
    barcodeScannerModal.addEventListener("modal:close", () => {
      stopBarcodeScanner();

      if (returnModalId) {
        const returnModal = document.getElementById(returnModalId);
        if (returnModal?.classList.contains("hidden")) {
          openModal(returnModalId);
        }
      }
    });
  }

  const viewItemForm = document.getElementById("view-item-form");
  const editItemButton = document.getElementById("edit-item-button");
  const saveItemButton = document.getElementById("save-item-button");
  const priceHistoryLink = document.getElementById("price-history-link");
  const viewItemFields = {
    id: document.getElementById("view_item_id"),
    barcode: document.getElementById("view_item_barcode"),
    name: document.getElementById("view_item_name"),
    price: document.getElementById("view_item_price"),
    quantity: document.getElementById("view_item_quantity"),
    minQuantity: document.getElementById("view_item_min_quantity"),
    maxQuantity: document.getElementById("view_item_max_quantity"),
    category: document.getElementById("view_item_category")
  };

  function setViewMode(editing) {
    ["barcode", "name", "price", "quantity", "minQuantity", "maxQuantity"].forEach((key) => {
      if (viewItemFields[key]) viewItemFields[key].readOnly = !editing;
    });
    if (viewItemFields.category) viewItemFields.category.disabled = !editing;
    if (editItemButton) editItemButton.classList.toggle("hidden", editing);
    if (saveItemButton) saveItemButton.classList.toggle("hidden", !editing);
  }

  document.querySelectorAll(".view-item-trigger").forEach((button) => {
    button.addEventListener("click", () => {
      const item = button.dataset;
      if (viewItemFields.id) viewItemFields.id.value = item.id || "";
      if (viewItemFields.barcode) viewItemFields.barcode.value = item.barcode || "";
      if (viewItemFields.name) viewItemFields.name.value = item.name || "";
      if (viewItemFields.price) viewItemFields.price.value = item.price || "";
      if (viewItemFields.quantity) viewItemFields.quantity.value = item.quantity || "";
      if (viewItemFields.minQuantity) viewItemFields.minQuantity.value = item.minQuantity || "";
      if (viewItemFields.maxQuantity) viewItemFields.maxQuantity.value = item.maxQuantity || "";
      if (viewItemFields.category) viewItemFields.category.value = item.categoryId || "";
      if (viewItemForm) viewItemForm.action = `/inventory/items/${item.id}`;
      if (priceHistoryLink) priceHistoryLink.href = `/inventory/items/${item.id}/price`;
      setViewMode(false);
      openModal("view-item-modal");
    });
  });

  if (editItemButton) editItemButton.addEventListener("click", () => setViewMode(true));

  const selectedItemsBody = document.getElementById("selected-items-body");
  const noSelectedItemsRow = document.getElementById("no-selected-items-row");
  const transactionTotal = document.getElementById("transaction-total");

  function updateTransactionTotal() {
    if (!selectedItemsBody || !transactionTotal) return;
    let total = 0;

    selectedItemsBody.querySelectorAll(".selected-item-row").forEach((row) => {
      const price = Number(row.querySelector(".selected-item-price")?.value || 0);
      const qty = Number(row.querySelector(".selected-item-qty")?.value || 0);
      const subtotal = price * qty;
      const subtotalCell = row.querySelector(".selected-item-subtotal");
      if (subtotalCell) subtotalCell.textContent = subtotal.toFixed(2);
      total += subtotal;
    });

    transactionTotal.textContent = total.toFixed(2);
  }

  function toggleSelectedItemsEmptyState() {
    if (!selectedItemsBody || !noSelectedItemsRow) return;
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
      if (!selectedItemsBody) return;

      const id = button.dataset.id;
      const barcode = button.dataset.barcode;
      const name = button.dataset.name;
      const price = Number(button.dataset.price || 0);
      const stock = Number(button.dataset.stock || 0);

      if (stock <= 0) {
        openModal("out-of-stock-modal");
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

  document.querySelectorAll(".report-details-trigger").forEach((button) => {
    button.addEventListener("click", async () => {
      const transactionId = button.dataset.id;
      const reportInvoice = document.getElementById("report_invoice_no");
      const reportDate = document.getElementById("report_date");
      const reportTotal = document.getElementById("report_total_amount");
      const reportItemsBody = document.getElementById("report-items-body");

      if (reportInvoice) reportInvoice.textContent = button.dataset.invoice || transactionId;
      if (reportDate) reportDate.textContent = button.dataset.date || "";
      if (reportTotal) reportTotal.textContent = button.dataset.total || "0.00";
      if (reportItemsBody) {
        reportItemsBody.innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-center text-sm text-slate-500">Loading...</td></tr>';
      }

      openModal("report-details-modal");

      try {
        const response = await fetch(`/reports/${transactionId}/items`);
        const items = await response.json();

        if (!reportItemsBody) return;
        if (!items.length) {
          reportItemsBody.innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-center text-sm text-slate-500">No items found.</td></tr>';
          return;
        }

        reportItemsBody.innerHTML = items.map((item) => `
          <tr class="border-b border-slate-200">
            <td class="px-4 py-3">${item.barcode}</td>
            <td class="px-4 py-3">${item.name}</td>
            <td class="px-4 py-3">PHP ${Number(item.price || 0).toFixed(2)}</td>
            <td class="px-4 py-3">${Number(item.quantity || 0)}</td>
            <td class="px-4 py-3">PHP ${Number(item.subtotal || 0).toFixed(2)}</td>
          </tr>
        `).join("");
      } catch (error) {
        if (reportItemsBody) {
          reportItemsBody.innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-center text-sm text-rose-600">Failed to load transaction details.</td></tr>';
        }
      }
    });
  });
});
