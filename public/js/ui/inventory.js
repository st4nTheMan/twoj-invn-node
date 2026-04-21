// Submits inventory modal forms without reloading the page and updates the view in place.
(function initInventoryPageUi() {
  const InventoryUi = window.InventoryUi || {};

  InventoryUi.onReady(() => {
    const addItemForm = document.getElementById("add-item-form");
    const addCategoryForm = document.getElementById("add-category-form");
    const inventoryTableBody = document.querySelector("#inventory-table tbody");
    const inventorySearch = document.getElementById("inventory-search");
    const inventoryEmptySearch = document.getElementById("inventory-empty-search");
    const addItemCategorySelect = addItemForm?.querySelector('select[name="category_id"]');
    const barcodeInput = addItemForm?.querySelector('input[name="barcode"]');
    const verifyBarcodeButton = document.getElementById("verify-barcode-button");
    const barcodeVerificationStatus = document.getElementById("barcode-verification-status");
    const addCategoryExistingSelect = addCategoryForm?.querySelector("select");
    const archiveItemButton = document.getElementById("view-item-archive-button");
    const archiveItemConfirmForm = document.getElementById("archive-item-confirm-form");
    const archiveItemConfirmMessage = document.getElementById("archive-item-confirm-message");
    let lastVerifiedBarcode = "";
    let lastVerificationExists = null;

    if (!InventoryUi.showFlashFeedback) {
      return;
    }

    const currencyFormatter = new Intl.NumberFormat("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    const dateTimeFormatter = new Intl.DateTimeFormat("en-PH", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    });

    // Formats prices for newly inserted inventory rows.
    function formatCurrency(value) {
      return currencyFormatter.format(Number(value || 0));
    }

    // Formats item timestamps for the inventory table.
    function formatDateTime(value) {
      if (!value) return "";
      return dateTimeFormatter.format(new Date(value));
    }

    // Trims outer whitespace and collapses repeated inner whitespace.
    function normalizeText(value) {
      return String(value ?? "").replace(/\s+/g, " ").trim();
    }

    // Normalizes decimal-style input by removing commas after whitespace cleanup.
    function normalizeDecimalInput(value) {
      return normalizeText(value).replace(/,/g, "");
    }

    // Escapes dynamic text before it is inserted into HTML attributes or cells.
    function escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    // Writes the selected item details into the shared view-item modal.
    function populateViewItemModal(trigger) {
      if (!trigger) return;

      const modalFields = {
        name: document.getElementById("view-item-modal-name"),
        barcode: document.getElementById("view-item-modal-barcode"),
        itemName: document.getElementById("view-item-modal-item-name"),
        cost: document.getElementById("view-item-modal-cost"),
        price: document.getElementById("view-item-modal-price"),
        quantity: document.getElementById("view-item-modal-quantity"),
        minQuantity: document.getElementById("view-item-modal-min-quantity"),
        maxQuantity: document.getElementById("view-item-modal-max-quantity"),
        category: document.getElementById("view-item-modal-category"),
        createdBy: document.getElementById("view-item-modal-created-by"),
        updatedBy: document.getElementById("view-item-modal-updated-by")
      };

      if (!modalFields.name) return;

      modalFields.name.textContent = trigger.dataset.itemName || "Item Details";
      modalFields.barcode.textContent = trigger.dataset.itemBarcode || "";
      modalFields.itemName.textContent = trigger.dataset.itemName || "";
      modalFields.cost.textContent = `PHP ${formatCurrency(trigger.dataset.itemCost)}`;
      modalFields.price.textContent = `PHP ${formatCurrency(trigger.dataset.itemPrice)}`;
      modalFields.quantity.textContent = String(trigger.dataset.itemQuantity || "0");
      modalFields.minQuantity.textContent = String(trigger.dataset.itemMinQuantity || "0");
      modalFields.maxQuantity.textContent = String(trigger.dataset.itemMaxQuantity || "0");
      modalFields.category.textContent = trigger.dataset.itemCategory || "No Category";
      modalFields.createdBy.textContent = trigger.dataset.itemCreatedBy || "-";
      modalFields.updatedBy.textContent = trigger.dataset.itemUpdatedBy || "-";

      if (archiveItemButton) {
        archiveItemButton.dataset.itemId = trigger.dataset.itemId || "";
        archiveItemButton.dataset.itemName = trigger.dataset.itemName || "this item";
      }
      if (archiveItemConfirmForm) {
        archiveItemConfirmForm.action = `/inventory/items/${encodeURIComponent(trigger.dataset.itemId || "0")}/archive`;
      }
      if (archiveItemConfirmMessage) {
        archiveItemConfirmMessage.textContent = `Archive ${trigger.dataset.itemName || "this item"}?`;
      }
    }

    // Binds click handlers so inventory rows can open the item-details modal.
    function bindViewItemTriggers(scope = document) {
      scope.querySelectorAll("[data-view-item-trigger]").forEach((trigger) => {
        if (trigger.dataset.viewItemBound === "true") return;

        trigger.dataset.viewItemBound = "true";
        trigger.addEventListener("click", () => {
          populateViewItemModal(trigger);
          InventoryUi.openModal?.(trigger.dataset.openModal || "view-item-modal");
        });
      });
    }

    InventoryUi.bindViewItemTriggers = bindViewItemTriggers;

    // Disables a modal form submit button while an async save is in progress.
    function setSubmitDisabled(form, disabled) {
      const submitButton = form.querySelector('button[type="submit"]');
      if (!submitButton) return;

      submitButton.disabled = disabled;
      submitButton.classList.toggle("opacity-70", disabled);
      submitButton.classList.toggle("cursor-not-allowed", disabled);
    }

    // Disables or enables a button while preserving its visual affordance.
    function setButtonDisabled(button, disabled) {
      if (!button) return;

      button.disabled = disabled;
      button.classList.toggle("opacity-70", disabled);
      button.classList.toggle("cursor-not-allowed", disabled);
    }

    // Removes the placeholder row shown when the inventory list is empty.
    function removeEmptyInventoryRow() {
      inventoryTableBody?.querySelector("td[colspan='8']")?.closest("tr")?.remove();
    }

    // Inserts a newly created item at the top of the inventory table.
    function prependInventoryRow(item) {
      if (!inventoryTableBody || !item) return;

      removeEmptyInventoryRow();

      const row = document.createElement("tr");
      row.dataset.row = "";
      row.className = "hover:bg-slate-50";
      row.innerHTML = `
        <td data-label="Item Number" class="px-4 py-3 font-medium">${escapeHtml(item.barcode)}</td>
        <td data-label="Name" class="px-4 py-3">${escapeHtml(item.name)}</td>
        <td data-label="Price" class="px-4 py-3">PHP ${formatCurrency(item.price)}</td>
        <td data-label="Qty" class="px-4 py-3">${Number(item.quantity || 0)}</td>
        <td data-label="Category" class="px-4 py-3">${escapeHtml(item.category_name || "No Category")}</td>
        <td data-label="Created By" class="px-4 py-3 text-slate-500">${escapeHtml(item.created_by_username || "-")}</td>
        <td data-label="Created" class="px-4 py-3 text-slate-500">${escapeHtml(formatDateTime(item.created_at))}</td>
        <td data-label="Actions" class="px-4 py-3">
          <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              data-open-modal="view-item-modal"
              data-view-item-trigger
              data-item-id="${escapeHtml(item.id)}"
              data-item-barcode="${escapeHtml(item.barcode)}"
              data-item-name="${escapeHtml(item.name)}"
              data-item-cost="${escapeHtml(item.cost)}"
              data-item-price="${escapeHtml(item.price)}"
              data-item-quantity="${escapeHtml(Number(item.quantity || 0))}"
              data-item-min-quantity="${escapeHtml(Number(item.min_quantity || 0))}"
              data-item-max-quantity="${escapeHtml(Number(item.max_quantity || 0))}"
              data-item-category="${escapeHtml(item.category_name || "No Category")}"
              data-item-created-by="${escapeHtml(item.created_by_username || "-")}"
              data-item-updated-by="${escapeHtml(item.updated_by_username || "-")}"
              class="rounded-xl border border-sky-300 px-3 py-2 text-center text-xs font-semibold text-sky-700"
            >
              View Item
            </button>
          </div>
        </td>
      `;

      inventoryTableBody.prepend(row);
      bindViewItemTriggers(row);
      inventoryEmptySearch?.classList.add("hidden");
    }

    // Adds a category option to a select element if it is not already present.
    function appendCategoryOption(select, category, includeValue) {
      if (!select || !category) return;

      const existing = Array.from(select.options).some((option) => {
        return includeValue
          ? String(option.value) === String(category.id)
          : option.textContent === category.category_name;
      });
      if (existing) return;

      const option = document.createElement("option");
      option.textContent = includeValue || !category.created_by_username
        ? category.category_name
        : `${category.category_name} - ${category.created_by_username}`;
      if (includeValue) {
        option.value = String(category.id);
      }

      select.appendChild(option);
    }

    // Updates the inline item-number verification message state.
    function setBarcodeVerificationStatus(type, message) {
      if (!barcodeVerificationStatus) return;

      if (!message) {
        barcodeVerificationStatus.textContent = "";
        barcodeVerificationStatus.classList.add("hidden");
        barcodeVerificationStatus.className = "mt-2 hidden rounded-2xl border px-4 py-3 text-sm";
        return;
      }

      barcodeVerificationStatus.textContent = message;
      barcodeVerificationStatus.className = [
        "mt-2",
        "rounded-2xl",
        "border",
        "px-4",
        "py-3",
        "text-sm",
        type === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : type === "warning"
            ? "border-amber-200 bg-amber-50 text-amber-800"
            : "border-rose-200 bg-rose-50 text-rose-800"
      ].join(" ");
    }

    // Clears any verification result once the item number changes.
    function resetBarcodeVerification() {
      lastVerifiedBarcode = "";
      lastVerificationExists = null;
      setBarcodeVerificationStatus("", "");
    }

    // Verifies whether the current item number already exists in inventory.
    async function verifyBarcode() {
      const barcode = normalizeText(barcodeInput?.value);

      if (!barcode) {
        setBarcodeVerificationStatus("error", "Enter an item number first.");
        barcodeInput?.focus();
        return { ok: false, exists: null };
      }

      if (barcodeInput) {
        barcodeInput.value = barcode;
      }

      setButtonDisabled(verifyBarcodeButton, true);
      setBarcodeVerificationStatus("warning", "Checking item number...");

      try {
        const response = await fetch(`/inventory/items/verify?barcode=${encodeURIComponent(barcode)}`, {
          headers: {
            Accept: "application/json",
            "X-Requested-With": "XMLHttpRequest"
          }
        });
        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          lastVerifiedBarcode = "";
          lastVerificationExists = null;
          setBarcodeVerificationStatus("error", payload.message || "Unable to verify item number right now.");
          return { ok: false, exists: null, payload };
        }

        lastVerifiedBarcode = barcode;
        lastVerificationExists = Boolean(payload.exists);
        if (payload.exists) {
          setBarcodeVerificationStatus(
            "error",
            payload.message || "Item number already exists."
          );
        } else {
          setBarcodeVerificationStatus("", "");
          InventoryUi.showFlashFeedback(
            "success",
            payload.message || "Item number is available."
          );
        }

        return { ok: true, exists: Boolean(payload.exists), payload };
      } catch (error) {
        lastVerifiedBarcode = "";
        lastVerificationExists = null;
        setBarcodeVerificationStatus("error", "Unable to verify item number right now.");
        return { ok: false, exists: null };
      } finally {
        setButtonDisabled(verifyBarcodeButton, false);
      }
    }

    // Submits an inventory modal form over fetch and returns the parsed payload.
    async function submitInventoryForm(form) {
      const formData = new FormData(form);
      const body = new URLSearchParams();

      for (const [key, value] of formData.entries()) {
        body.append(key, String(value));
      }

      setSubmitDisabled(form, true);

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
          InventoryUi.showFlashFeedback("error", payload.message || "Unable to save right now.");
          return payload;
        }

        InventoryUi.showFlashFeedback("success", payload.message || "Saved successfully.");
        return payload;
      } catch (error) {
        InventoryUi.showFlashFeedback("error", "Unable to save right now.");
        return null;
      } finally {
        setSubmitDisabled(form, false);
      }
    }

    if (addItemForm) {
      addItemForm.addEventListener("submit", async (event) => {
        if (event.defaultPrevented) {
          return;
        }

        event.preventDefault();
        addItemForm.querySelectorAll('input[name="barcode"], input[name="name"]').forEach((input) => {
          if (!input) return;
          input.value = normalizeText(input.value);
        });
        addItemForm.querySelectorAll('input[name="cost"], input[name="price"]').forEach((input) => {
          if (!input) return;
          input.value = normalizeDecimalInput(input.value);
        });

        const currentBarcode = normalizeText(barcodeInput?.value);

        if (currentBarcode && currentBarcode !== lastVerifiedBarcode) {
          const verification = await verifyBarcode();
          if (!verification.ok || verification.exists) {
            return;
          }
        } else if (lastVerificationExists) {
          setBarcodeVerificationStatus("error", "Item number already exists.");
          barcodeInput?.focus();
          return;
        }

        const payload = await submitInventoryForm(addItemForm);

        if (!payload?.ok) {
          return;
        }

        prependInventoryRow(payload.item);
        addItemForm.reset();
        resetBarcodeVerification();
      });
    }

    if (addCategoryForm) {
      addCategoryForm.addEventListener("submit", async (event) => {
        if (event.defaultPrevented) {
          return;
        }

        event.preventDefault();
        const categoryNameInput = addCategoryForm.querySelector('input[name="category_name"]');
        if (categoryNameInput) {
          categoryNameInput.value = normalizeText(categoryNameInput.value);
        }

        const payload = await submitInventoryForm(addCategoryForm);

        if (!payload?.ok || !payload.category) {
          return;
        }

        appendCategoryOption(addItemCategorySelect, payload.category, true);
        appendCategoryOption(addCategoryExistingSelect, payload.category, false);
        addCategoryForm.reset();
      });
    }

    barcodeInput?.addEventListener("input", () => {
      if (normalizeText(barcodeInput.value) !== lastVerifiedBarcode) {
        resetBarcodeVerification();
      }
    });

    verifyBarcodeButton?.addEventListener("click", async () => {
      await verifyBarcode();
    });

    bindViewItemTriggers();
  });
}());
