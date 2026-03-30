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

      searchInput.addEventListener("input", () => {
        const searchValue = searchInput.value.toLowerCase().trim();
        let visibleCount = 0;

        rows.forEach((row) => {
          const matches = !searchValue || row.textContent.toLowerCase().includes(searchValue);
          row.classList.toggle("hidden", !matches);
          if (matches) {
            visibleCount += 1;
          }
        });

        if (emptyState) {
          emptyState.classList.toggle("hidden", visibleCount !== 0);
        }
      });
    }

    bindSearch("inventory-search", "inventory-table", "inventory-empty-search");
    bindSearch("transaction-search", "transaction-table", "transaction-empty-search");
    bindSearch("reports-search", "reports-table", "reports-empty-search");
  });
}());
