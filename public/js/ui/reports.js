// Loads report detail rows into the transaction detail modal on demand.
(function initReportsUi() {
  const InventoryUi = window.InventoryUi || {};

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  const currencyFormatter = new Intl.NumberFormat("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  function bindReportDetailTriggers(scope = document) {
    scope.querySelectorAll(".report-details-trigger").forEach((button) => {
      if (button.dataset.reportDetailsBound === "true") return;
      button.dataset.reportDetailsBound = "true";

      button.addEventListener("click", async () => {
        const transactionId = button.dataset.id;
        const reportInvoice = document.getElementById("report_invoice_no");
        const reportDate = document.getElementById("report_date");
        const reportTotal = document.getElementById("report_total_amount");
        const reportCreatedBy = document.getElementById("report_created_by");
        const reportCashReceived = document.getElementById("report_cash_received");
        const reportChangeAmount = document.getElementById("report_change_amount");
        const reportItemsBody = document.getElementById("report-items-body");

        if (reportInvoice) reportInvoice.textContent = button.dataset.invoice || transactionId;
        if (reportDate) reportDate.textContent = button.dataset.date || "";
        if (reportTotal) reportTotal.textContent = button.dataset.total || "0.00";
        if (reportCreatedBy) reportCreatedBy.textContent = button.dataset.createdBy || "-";
        if (reportCashReceived) reportCashReceived.textContent = button.dataset.cashReceived || "0.00";
        if (reportChangeAmount) reportChangeAmount.textContent = button.dataset.changeAmount || "0.00";
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
  }

  function renderDailySales(dailySales) {
    const tbody = document.getElementById("daily-sales-tbody");
    const totalDays = document.getElementById("daily-sales-total-days");

    if (!tbody) return;

    if (totalDays) {
      totalDays.textContent = `${dailySales.length} day${dailySales.length === 1 ? "" : "s"}`;
    }

    if (!dailySales.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="px-4 py-8 text-center text-slate-500">No daily sales found.</td></tr>';
      return;
    }

    tbody.innerHTML = dailySales.map((day) => `
      <tr>
        <td data-label="Date" class="px-4 py-3 font-medium">${escapeHtml(day.sales_date_label || day.sales_date || "")}</td>
        <td data-label="Transactions" class="px-4 py-3 text-slate-600">${Number(day.transaction_count || 0)}</td>
        <td data-label="Total Sales" class="px-4 py-3 font-semibold text-emerald-700">PHP ${currencyFormatter.format(Number(day.total_sales || 0))}</td>
      </tr>
    `).join("");
  }

  window.ReportsUi = {
    ...(window.ReportsUi || {}),
    bindReportDetailTriggers,
    renderDailySales
  };

  InventoryUi.onReady(() => {
    bindReportDetailTriggers();

    const readingDateInput = document.getElementById("cash-drawer-reading-date");
    readingDateInput?.addEventListener("change", () => {
      if (!readingDateInput.value) return;
      const url = new URL(window.location.href);
      url.searchParams.set("reading_date", readingDateInput.value);
      url.searchParams.delete("page");
      window.location.href = url.toString();
    });
  });
}());
