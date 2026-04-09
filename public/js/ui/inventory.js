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
    const addCategoryExistingSelect = addCategoryForm?.querySelector("select");

    if (!addItemForm || !addCategoryForm || !InventoryUi.showFlashFeedback) {
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

    // Disables a modal form submit button while an async save is in progress.
    function setSubmitDisabled(form, disabled) {
      const submitButton = form.querySelector('button[type="submit"]');
      if (!submitButton) return;

      submitButton.disabled = disabled;
      submitButton.classList.toggle("opacity-70", disabled);
      submitButton.classList.toggle("cursor-not-allowed", disabled);
    }

    // Removes the placeholder row shown when the inventory list is empty.
    function removeEmptyInventoryRow() {
      inventoryTableBody?.querySelector("td[colspan='7']")?.closest("tr")?.remove();
    }

    // Inserts a newly created item at the top of the inventory table.
    function prependInventoryRow(item) {
      if (!inventoryTableBody || !item) return;

      removeEmptyInventoryRow();

      const row = document.createElement("tr");
      row.dataset.row = "";
      row.className = "hover:bg-slate-50";
      row.innerHTML = `
        <td data-label="Item Number" class="px-4 py-3 font-medium">${item.barcode}</td>
        <td data-label="Name" class="px-4 py-3">${item.name}</td>
        <td data-label="Price" class="px-4 py-3">PHP ${formatCurrency(item.price)}</td>
        <td data-label="Qty" class="px-4 py-3">${Number(item.quantity || 0)}</td>
        <td data-label="Category" class="px-4 py-3">${item.category_name || "No Category"}</td>
        <td data-label="Created" class="px-4 py-3 text-slate-500">${formatDateTime(item.created_at)}</td>
        <td data-label="Actions" class="px-4 py-3">
          <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <a href="/inventory/items/${item.id}" class="rounded-xl border border-sky-300 px-3 py-2 text-center text-xs font-semibold text-sky-700">View Item</a>
          </div>
        </td>
      `;

      inventoryTableBody.prepend(row);
      inventorySearch?.dispatchEvent(new Event("input"));
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
      option.textContent = category.category_name;
      if (includeValue) {
        option.value = String(category.id);
      }

      select.appendChild(option);
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

    addItemForm.addEventListener("submit", async (event) => {
      if (event.defaultPrevented) {
        return;
      }

      event.preventDefault();
      const payload = await submitInventoryForm(addItemForm);

      if (!payload?.ok) {
        return;
      }

      prependInventoryRow(payload.item);
      addItemForm.reset();
    });

    addCategoryForm.addEventListener("submit", async (event) => {
      if (event.defaultPrevented) {
        return;
      }

      event.preventDefault();
      const payload = await submitInventoryForm(addCategoryForm);

      if (!payload?.ok || !payload.category) {
        return;
      }

      appendCategoryOption(addItemCategorySelect, payload.category, true);
      appendCategoryOption(addCategoryExistingSelect, payload.category, false);
      addCategoryForm.reset();
    });
  });
}());
