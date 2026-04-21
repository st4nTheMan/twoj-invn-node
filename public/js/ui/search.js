// Powers the search fields used by the inventory, transaction, and report tables.
(function initSearchUi() {
  const InventoryUi = window.InventoryUi || {};

  InventoryUi.onReady(() => {
    // Builds searchable text from visible row content without indexing hidden form options.
    function getRowSearchText(row) {
      if (!row) return "";

      return Array.from(row.querySelectorAll("td[data-label]"))
        .map((td) => {
          const clone = td.cloneNode(true);
          clone.querySelectorAll("input, textarea, select, button").forEach((el) => el.remove());
          return clone.textContent;
        })
        .join(" ")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
    }

    // Wires the inventory search to fetch results from the server and swap the table in place.
    function bindInventorySearch() {
      const searchInput = document.getElementById("inventory-search");
      const clearButton = document.getElementById("search-clear");
      const tbody = document.getElementById("inventory-tbody");
      const paginationTop = document.getElementById("inventory-pagination-top");
      const paginationBottom = document.getElementById("inventory-pagination-bottom");
      const emptyState = document.getElementById("inventory-empty-search");

      if (!searchInput || !tbody) return;

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

      function formatCurrency(value) {
        return currencyFormatter.format(Number(value || 0));
      }

      function formatDateTime(value) {
        if (!value) return "";
        return dateTimeFormatter.format(new Date(value));
      }

      function escapeHtml(value) {
        return String(value ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }

      // Renders fetched items into the tbody and swaps pagination HTML.
      function renderResults(items, paginationHtml) {
        if (!items.length) {
          tbody.innerHTML = `<tr><td colspan="8" class="px-4 py-8 text-center text-slate-500">No items found.</td></tr>`;
          if (paginationTop) paginationTop.innerHTML = "";
          if (paginationBottom) paginationBottom.innerHTML = "";
          emptyState?.classList.add("hidden");
          return;
        }

        tbody.innerHTML = items.map((item) => `
          <tr data-row class="hover:bg-slate-50">
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
                  data-item-id="${escapeHtml(String(item.id))}"
                  data-item-barcode="${escapeHtml(item.barcode)}"
                  data-item-name="${escapeHtml(item.name)}"
                  data-item-cost="${escapeHtml(String(item.cost))}"
                  data-item-price="${escapeHtml(String(item.price))}"
                  data-item-quantity="${escapeHtml(String(item.quantity || 0))}"
                  data-item-min-quantity="${escapeHtml(String(item.min_quantity || 0))}"
                  data-item-max-quantity="${escapeHtml(String(item.max_quantity || 0))}"
                  data-item-category="${escapeHtml(item.category_name || "No Category")}"
                  data-item-created-by="${escapeHtml(item.created_by_username || "-")}"
                  data-item-updated-by="${escapeHtml(item.updated_by_username || "-")}"
                  class="rounded-xl border border-sky-300 px-3 py-2 text-center text-xs font-semibold text-sky-700"
                >
                  View Item
                </button>
              </div>
            </td>
          </tr>
        `).join("");

        if (paginationTop) paginationTop.innerHTML = paginationHtml;
        if (paginationBottom) paginationBottom.innerHTML = paginationHtml;

        // Re-bind pagination links to use AJAX instead of full page navigation.
        bindPaginationLinks();

        // Re-bind view item triggers on newly rendered rows.
        window.InventoryUi?.bindViewItemTriggers?.(tbody);
      }

      // Fetches a page of inventory from the server via AJAX.
      async function fetchInventory(page, search) {
        const url = new URL("/inventory", window.location.origin);
        url.searchParams.set("page", page);
        if (search) url.searchParams.set("search", search);

        try {
          const response = await fetch(url.toString(), {
            headers: {
              Accept: "application/json",
              "X-Requested-With": "XMLHttpRequest"
            }
          });
          const payload = await response.json();
          if (!response.ok || !payload.ok) return null;
          return payload;
        } catch {
          return null;
        }
      }

      let currentSearch = searchInput.value.trim();
      let currentPage = 1;
      let searchTimer = null;

      // Intercepts pagination link clicks to load pages via AJAX.
      function bindPaginationLinks() {
        [paginationTop, paginationBottom].forEach((container) => {
          if (!container) return;
          container.querySelectorAll("a.pagination-link").forEach((link) => {
            if (link.dataset.ajaxBound === "true") return;
            link.dataset.ajaxBound = "true";
            link.addEventListener("click", async (event) => {
              event.preventDefault();
              const page = Number(link.dataset.page);
              if (!page) return;
              currentPage = page;
              const payload = await fetchInventory(currentPage, currentSearch);
              if (payload) renderResults(payload.items, payload.paginationHtml);
            });
          });
        });
      }

      // Debounced input handler — fetches from server as user types.
      searchInput.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(async () => {
          currentSearch = searchInput.value.trim();
          currentPage = 1;
          const payload = await fetchInventory(currentPage, currentSearch);
          if (payload) renderResults(payload.items, payload.paginationHtml);
        }, 300);
      });

      // Clear button resets search and reloads page 1.
      clearButton?.addEventListener("click", async () => {
        searchInput.value = "";
        currentSearch = "";
        currentPage = 1;
        const payload = await fetchInventory(1, "");
        if (payload) renderResults(payload.items, payload.paginationHtml);
      });

      // Bind pagination links on initial page load.
      bindPaginationLinks();
    }

    // Wires one search input to a table body and optional empty-state message.
    function bindSearch(inputId, tableId, emptyId) {
      const searchInput = document.getElementById(inputId);
      const table = document.getElementById(tableId);
      const emptyState = document.getElementById(emptyId);
      if (!searchInput || !table) return;

      const hideUntilSearch = searchInput.dataset.hideUntilSearch === "true";
      const initialVisibleCount = Number(searchInput.dataset.initialVisibleCount || 0);

      function updateSearchResults() {
        const rows = table.querySelectorAll("tbody tr[data-row]");
        const searchValue = searchInput.value.toLowerCase().trim();
        let visibleCount = 0;

        rows.forEach((row, index) => {
          const matches = searchValue && getRowSearchText(row).includes(searchValue);
          const shouldShowRow = searchValue
            ? matches
            : initialVisibleCount > 0
              ? index < initialVisibleCount
              : !hideUntilSearch;

          row.classList.toggle("hidden", !shouldShowRow);
          if (shouldShowRow) visibleCount += 1;
        });

        if (!emptyState) return;

        if (!searchValue && hideUntilSearch && initialVisibleCount === 0) {
          emptyState.textContent = searchInput.dataset.emptyPrompt || "Search for an item number, name, or category to view results.";
          emptyState.classList.remove("hidden");
          return;
        }

        if (!searchValue && initialVisibleCount > 0) {
          emptyState.classList.add("hidden");
          return;
        }

        emptyState.textContent = "No items found.";
        emptyState.classList.toggle("hidden", visibleCount !== 0);
      }

      searchInput.addEventListener("input", updateSearchResults);
      updateSearchResults();
    }

    document.querySelectorAll("[id$='search-clear']").forEach((clearBtn) => {
      const input = clearBtn.closest("div")?.querySelector("input");
      if (!input || input.id === "inventory-search") return;
      clearBtn.addEventListener("click", () => {
        input.value = "";
        input.dispatchEvent(new Event("input"));
      });
    });

    bindInventorySearch();
    bindSearch("adjustments-search", "adjustments-table", "adjustments-empty-search");
    bindSearch("history-search", "history-table", "history-empty-search");
    bindSearch("price-lookup-search", "price-lookup-table", "price-lookup-empty-search");
    bindSearch("transaction-search", "transaction-table", "transaction-empty-search");
    bindSearch("credit-ledger-search", "credit-ledger-table", "credit-ledger-empty-search");
    bindSearch("credit-ledger-item-search", "credit-ledger-item-table", "credit-ledger-item-empty-search");
    bindSearch("reports-search", "reports-table", "reports-empty-search");
  });
}());