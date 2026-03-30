// Loads report detail rows into the transaction detail modal on demand.
(function initReportsUi() {
  const InventoryUi = window.InventoryUi || {};

  InventoryUi.onReady(() => {
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

        InventoryUi.openModal?.("report-details-modal");

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
              <td data-label="Item Number" class="px-4 py-3">${item.barcode}</td>
              <td data-label="Item Name" class="px-4 py-3">${item.name}</td>
              <td data-label="Price" class="px-4 py-3">PHP ${Number(item.price || 0).toFixed(2)}</td>
              <td data-label="Qty" class="px-4 py-3">${Number(item.quantity || 0)}</td>
              <td data-label="Subtotal" class="px-4 py-3">PHP ${Number(item.subtotal || 0).toFixed(2)}</td>
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
}());
