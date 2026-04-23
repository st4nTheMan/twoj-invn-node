// Powers search and pagination for inventory-style tables across the app.
(function initSearchUi() {
  const InventoryUi = window.InventoryUi || {};

  InventoryUi.onReady(() => {

    // Builds searchable text from labelled table cells only.
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

    // Shared formatters used by row renderers.
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
      hour12: true,
      timeZone: "Asia/Manila"
    });

    function formatCurrency(value) {
      return currencyFormatter.format(Number(value || 0));
    }

    function formatDateTime(value) {
      if (!value) return "";
      const normalized = String(value).trim().replace(" ", "T");
      const iso = normalized.endsWith("Z") || normalized.includes("+") ? normalized : `${normalized}Z`;
      const date = new Date(iso);
      if (isNaN(date.getTime())) return "";
      return dateTimeFormatter.format(date);
    }

    function formatInvoice(id) {
      return `INV-${String(id).padStart(6, "0")}`;
    }

    function escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    // Wires AJAX search + pagination to any table that follows the standard pattern.
    function bindAjaxTable({
      searchInputId,
      clearButtonId,
      sortSelectId,
      filterSelectId,
      tbodyId,
      paginationTopId,
      paginationBottomId,
      emptyStateId,
      endpoint,
      renderRow,
      colSpan,
      onAfterRender
    }) {
      const searchInput = document.getElementById(searchInputId);
      const clearButton = document.getElementById(clearButtonId);
      const tbody = document.getElementById(tbodyId);
      const paginationTop = document.getElementById(paginationTopId);
      const paginationBottom = document.getElementById(paginationBottomId);
      const emptyState = document.getElementById(emptyStateId);

      if (!searchInput || !tbody) return;

      // Scope sort/filter selects to the filter bar that belongs to this table.
      const tableId = tbodyId.replace("-tbody", "-table");
      const filterSortBar = document.querySelector(`[data-table="${tableId}"]`);

      const sortSelect = (sortSelectId ? document.getElementById(sortSelectId) : null)
        || filterSortBar?.querySelector("[data-sort-select]");
      const filterSelect = (filterSelectId ? document.getElementById(filterSelectId) : null)
        || filterSortBar?.querySelector("[data-filter-select]");
      const resetButton = document.getElementById(`${tableId}-filter-reset`)
        || filterSortBar?.querySelector("[data-filter-reset]");
        
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
              const payload = await fetchPage(currentPage, currentSearch);
              if (payload) renderResults(payload);
            });
          });
        });
      }

      // Renders fetched rows into the tbody and swaps pagination HTML.
      function renderResults(payload) {
        const { items, paginationHtml } = payload;

        if (!items.length) {
          tbody.innerHTML = `<tr><td colspan="${colSpan}" class="px-4 py-8 text-center text-slate-500">No items found.</td></tr>`;
          if (paginationTop) paginationTop.innerHTML = "";
          if (paginationBottom) paginationBottom.innerHTML = "";
          emptyState?.classList.add("hidden");
          return;
        }

        tbody.innerHTML = items.map(renderRow).join("");
        if (paginationTop) paginationTop.innerHTML = paginationHtml;
        if (paginationBottom) paginationBottom.innerHTML = paginationHtml;
        emptyState?.classList.add("hidden");

        bindPaginationLinks();
        onAfterRender?.(tbody);
      }

      // Fetches a page from the server via AJAX including sort and filter state.
      async function fetchPage(page, search) {
        const url = new URL(endpoint, window.location.origin);
        url.searchParams.set("page", String(page));
        url.searchParams.set("_", Date.now());
        if (search) url.searchParams.set("search", search);
        if (sortSelect?.value) url.searchParams.set("sort", sortSelect.value);
        if (filterSelect?.value) {
          const paramName = filterSelect.dataset.param;
          if (paramName) url.searchParams.set(paramName, filterSelect.value);
        }

        try {
          const response = await fetch(url.toString(), {
            cache: "no-store",
            headers: {
              Accept: "application/json",
              "X-Requested-With": "XMLHttpRequest"
            }
          });
          const payload = await response.json();
          return response.ok && payload.ok ? payload : null;
        } catch {
          return null;
        }
      }

      let currentSearch = searchInput.value.trim();
      let currentPage = 1;
      let searchTimer = null;

      searchInput.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(async () => {
          currentSearch = searchInput.value.trim();
          currentPage = 1;
          const payload = await fetchPage(currentPage, currentSearch);
          if (payload) renderResults(payload);
        }, 300);
      });

      clearButton?.addEventListener("click", async () => {
        searchInput.value = "";
        currentSearch = "";
        currentPage = 1;
        const payload = await fetchPage(1, "");
        if (payload) renderResults(payload);
      });

      sortSelect?.addEventListener("change", async () => {
        currentPage = 1;
        const payload = await fetchPage(currentPage, currentSearch);
        if (payload) renderResults(payload);
      });

      filterSelect?.addEventListener("change", async () => {
        currentPage = 1;
        const payload = await fetchPage(currentPage, currentSearch);
        if (payload) renderResults(payload);
      });

      resetButton?.addEventListener("click", async () => {
        searchInput.value = "";
        currentSearch = "";
        currentPage = 1;
        if (sortSelect) sortSelect.value = sortSelect.options[0]?.value || "";
        if (filterSelect) filterSelect.value = "";
        const payload = await fetchPage(1, "");
        if (payload) renderResults(payload);
      });

      bindPaginationLinks();
    }

    // Wires a plain client-side search to a table (no pagination, no server).
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
          emptyState.textContent = searchInput.dataset.emptyPrompt || "Search to view results.";
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

    // Generic clear button handler for plain client-side search inputs.
    document.querySelectorAll("[id$='search-clear']").forEach((clearBtn) => {
      const input = clearBtn.closest("section, div")?.querySelector("input[type='text']");
      if (!input) return;

      clearBtn.addEventListener("click", () => {
        input.value = "";
        input.dispatchEvent(new Event("input"));
      });
    });

    // ── Inventory ────────────────────────────────────────────────────────────
    bindAjaxTable({
      searchInputId: "inventory-search",
      clearButtonId: "search-clear",
      tbodyId: "inventory-tbody",
      paginationTopId: "inventory-pagination-top",
      paginationBottomId: "inventory-pagination-bottom",
      emptyStateId: "inventory-empty-search",
      endpoint: "/inventory",
      colSpan: 8,
      onAfterRender: (tbody) => {
        window.InventoryUi?.bindViewItemTriggers?.(tbody);
      },
      renderRow: (item) => `
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
              <button type="button"
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
                class="rounded-xl border border-sky-300 px-3 py-2 text-center text-xs font-semibold text-sky-700">
                View Item
              </button>
            </div>
          </td>
        </tr>`
    });

    // ── History ──────────────────────────────────────────────────────────────
    bindAjaxTable({
      searchInputId: "history-search",
      clearButtonId: "history-search-clear",
      tbodyId: "history-tbody",
      paginationTopId: "history-pagination-top",
      paginationBottomId: "history-pagination-bottom",
      emptyStateId: "history-empty-search",
      endpoint: "/history",
      colSpan: 5,
      renderRow: (item) => `
        <tr data-row class="hover:bg-slate-50">
          <td data-label="Item Number" class="px-4 py-3 font-medium">${escapeHtml(item.barcode)}</td>
          <td data-label="Name" class="px-4 py-3">${escapeHtml(item.name)}</td>
          <td data-label="Category" class="px-4 py-3">${escapeHtml(item.category_name || "No Category")}</td>
          <td data-label="Current" class="px-4 py-3 text-xs text-slate-500">
            OH: ${Number(item.quantity || 0)}<br>
            Min/Max: ${Number(item.min_quantity || 0)}/${Number(item.max_quantity || 0)}<br>
            Cost: PHP ${formatCurrency(item.cost)}<br>
            Price: PHP ${formatCurrency(item.price)}
          </td>
          <td data-label="Actions" class="px-4 py-3">
            <a href="/inventory/items/${escapeHtml(String(item.id))}/history"
              class="rounded-xl border border-slate-300 px-3 py-2 text-center text-xs font-semibold text-slate-700">
              Open History
            </a>
          </td>
        </tr>`
    });

    // ── Price Lookup ─────────────────────────────────────────────────────────
    bindAjaxTable({
      searchInputId: "price-lookup-search",
      clearButtonId: "price-lookup-search-clear",
      tbodyId: "price-lookup-tbody",
      paginationTopId: "price-lookup-pagination-top",
      paginationBottomId: "price-lookup-pagination-bottom",
      emptyStateId: "price-lookup-empty-search",
      endpoint: "/price-lookup",
      colSpan: 3,
      renderRow: (item) => `
        <tr data-row class="hover:bg-slate-50">
          <td data-label="Item Number" class="px-4 py-3 font-medium">${escapeHtml(item.barcode)}</td>
          <td data-label="Item Name" class="px-4 py-3">${escapeHtml(item.name)}</td>
          <td data-label="Price" class="px-4 py-3">PHP ${formatCurrency(item.price)}</td>
        </tr>`
    });

    // ── Reports ──────────────────────────────────────────────────────────────
    bindAjaxTable({
      searchInputId: "reports-search",
      clearButtonId: "reports-search-clear",
      tbodyId: "reports-tbody",
      paginationTopId: "reports-pagination-top",
      paginationBottomId: "reports-pagination-bottom",
      emptyStateId: "reports-empty-search",
      endpoint: "/reports",
      colSpan: 5,
      onAfterRender: (tbody) => {
        window.ReportsUi?.bindReportDetailTriggers?.(tbody);
      },
      renderRow: (item) => `
        <tr data-row class="hover:bg-slate-50">
          <td data-label="Invoice" class="px-4 py-3 font-medium">${escapeHtml(formatInvoice(item.id))}</td>
          <td data-label="Total" class="px-4 py-3">PHP ${formatCurrency(item.total_amount)}</td>
          <td data-label="Created By" class="px-4 py-3 text-slate-500">${escapeHtml(item.created_by_username || "-")}</td>
          <td data-label="Date" class="px-4 py-3 text-slate-500">${escapeHtml(formatDateTime(item.created_at))}</td>
          <td data-label="Action" class="px-4 py-3">
            <button type="button"
              class="report-details-trigger w-full rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white sm:w-auto"
              data-id="${escapeHtml(String(item.id))}"
              data-invoice="${escapeHtml(formatInvoice(item.id))}"
              data-total="${escapeHtml(formatCurrency(item.total_amount))}"
              data-date="${escapeHtml(formatDateTime(item.created_at))}"
              data-created-by="${escapeHtml(item.created_by_username || "-")}">
              View Details
            </button>
          </td>
        </tr>`
    });

    // ── Credit Ledger ────────────────────────────────────────────────────────
    bindAjaxTable({
      searchInputId: "credit-ledger-search",
      clearButtonId: "credit-ledger-search-clear",
      tbodyId: "credit-ledger-tbody",
      paginationTopId: "credit-ledger-pagination-top",
      paginationBottomId: "credit-ledger-pagination-bottom",
      emptyStateId: "credit-ledger-empty-search",
      endpoint: "/credit-ledger",
      colSpan: 6,
      onAfterRender: (tbody) => {
        window.CreditLedgerUi?.bindModalTriggers?.(tbody);
      },
      renderRow: (entry) => {
        const balanceDue = Number(entry.balance_due || 0);
        const totalAmount = Number(entry.total_amount || 0);
        const balanceHtml = balanceDue > 0
          ? `<span class="font-semibold text-violet-700">PHP ${formatCurrency(balanceDue)}</span>`
          : `<div class="font-semibold text-emerald-700">PHP ${formatCurrency(balanceDue)}</div>
             <div class="mt-1 text-xs text-slate-500">Paid / cleared</div>`;
        const sourceHtml = entry.transaction_id
          ? `<div class="font-medium">${escapeHtml(formatInvoice(entry.transaction_id))}</div>
             <div class="text-xs text-slate-500">Transaction credit sale</div>`
          : `<div class="font-medium">Manual Entry</div>
             <div class="text-xs text-slate-500">Saved directly to ledger</div>`;

        return `
          <tr data-row class="hover:bg-slate-50">
            <td data-label="Customer" class="px-4 py-3 align-top">
              <div class="font-semibold text-slate-900">${escapeHtml(entry.customer_name)}</div>
              <div class="text-xs text-slate-500">${escapeHtml(entry.customer_phone)}</div>
            </td>
            <td data-label="Ledger Details" class="px-4 py-3 align-top">
              <div class="font-medium text-slate-800">Total: PHP ${formatCurrency(totalAmount)}</div>
              <button type="button"
                class="open-credit-ledger-items-modal-button mt-2 rounded-xl border border-sky-200 px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-50"
                data-customer-name="${escapeHtml(entry.customer_name)}"
                data-total-amount="${totalAmount.toFixed(2)}"
                data-item-summary="${escapeHtml(entry.item_summary || '')}">
                View Items
              </button>
            </td>
            <td data-label="Balance Due" class="px-4 py-3 align-top">${balanceHtml}</td>
            <td data-label="Source" class="px-4 py-3 align-top text-slate-600">${sourceHtml}</td>
            <td data-label="Created By" class="px-4 py-3 align-top text-slate-500">${escapeHtml(entry.created_by_username || "-")}</td>
            <td data-label="Date" class="px-4 py-3 align-top text-slate-500">${escapeHtml(formatDateTime(entry.created_at))}</td>
          </tr>`;
      }
    });

    // ── Adjustments (client-side only, no pagination) ────────────────────────
    bindSearch("adjustments-search", "adjustments-table", "adjustments-empty-search");
    bindSearch("transaction-search", "transaction-table", "transaction-empty-search");
    bindSearch("credit-ledger-item-search", "credit-ledger-item-table", "credit-ledger-item-empty-search");
  });
}());