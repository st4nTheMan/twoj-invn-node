// Powers the search fields used by the inventory, transaction, and report tables.
(function initSearchUi() {
  const InventoryUi = window.InventoryUi || {};

  InventoryUi.onReady(() => {
    function bindSearch(inputId, tableId, emptyId) {
      const searchInput = document.getElementById(inputId);
      const table = document.getElementById(tableId);
      const emptyState = document.getElementById(emptyId);
      if (!searchInput || !table) return;

      const rows = table.querySelectorAll("tbody tr[data-row]");
      const hideUntilSearch = searchInput.dataset.hideUntilSearch === "true";
      const initialVisibleCount = Number(searchInput.dataset.initialVisibleCount || 0);

      function updateSearchResults() {
        const searchValue = searchInput.value.toLowerCase().trim();
        let visibleCount = 0;

        rows.forEach((row, index) => {
          const matches = searchValue && row.textContent.toLowerCase().includes(searchValue);
          const shouldShowRow = searchValue
            ? matches
            : initialVisibleCount > 0
              ? index < initialVisibleCount
              : !hideUntilSearch;

          row.classList.toggle("hidden", !shouldShowRow);
          if (shouldShowRow) {
            visibleCount += 1;
          }
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

    bindSearch("inventory-search", "inventory-table", "inventory-empty-search");
    bindSearch("adjustments-search", "adjustments-table", "adjustments-empty-search");
    bindSearch("history-search", "history-table", "history-empty-search");
    bindSearch("price-lookup-search", "price-lookup-table", "price-lookup-empty-search");
    bindSearch("transaction-search", "transaction-table", "transaction-empty-search");
    bindSearch("reports-search", "reports-table", "reports-empty-search");
  });
}());
