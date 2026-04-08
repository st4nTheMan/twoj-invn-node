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

      function updateSearchResults() {
        const searchValue = searchInput.value.toLowerCase().trim();
        let visibleCount = 0;

        rows.forEach((row) => {
          const matches = searchValue && row.textContent.toLowerCase().includes(searchValue);
          const shouldShowRow = hideUntilSearch ? matches : (!searchValue || matches);

          row.classList.toggle("hidden", !shouldShowRow);
          if (shouldShowRow) {
            visibleCount += 1;
          }
        });

        if (!emptyState) return;

        if (hideUntilSearch && !searchValue) {
          emptyState.textContent = "Search for an item number, name, or category to view results.";
          emptyState.classList.remove("hidden");
          return;
        }

        emptyState.textContent = "No items found.";
        emptyState.classList.toggle("hidden", visibleCount !== 0);
      }

      searchInput.addEventListener("input", updateSearchResults);
      updateSearchResults();
    }

    bindSearch("inventory-search", "inventory-table", "inventory-empty-search");
    bindSearch("transaction-search", "transaction-table", "transaction-empty-search");
    bindSearch("reports-search", "reports-table", "reports-empty-search");
  });
}());