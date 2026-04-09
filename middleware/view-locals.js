const pool = require("../database/pool");
const {
  formatCurrency,
  formatDateTime,
  formatInvoice
} = require("../includes/helpers");

// Builds stock alert data that is shown globally in the dashboard layout.
async function getStockNotifications() {
  const [items] = await pool.query(
    `SELECT items.*, categories.category_name
     FROM items
     LEFT JOIN categories ON items.category_id = categories.id
     ORDER BY items.name ASC`
  );

  const lowStockItems = [];
  const overStockItems = [];

  for (const item of items) {
    const quantity = Number(item.quantity || 0);
    const minQuantity = Number(item.min_quantity || 0);
    const maxQuantity = Number(item.max_quantity || 0);

    if (quantity <= minQuantity) {
      lowStockItems.push(item);
    } else if (maxQuantity > 0 && quantity >= maxQuantity) {
      overStockItems.push(item);
    }
  }

  return {
    lowStockItems,
    overStockItems,
    count: lowStockItems.length + overStockItems.length
  };
}

// Populates shared EJS locals and temporary session-backed UI state.
async function setViewLocals(req, res, next) {
  res.locals.title = "Inventory System";
  res.locals.currentPath = req.path;
  res.locals.user = req.session.user || null;
  res.locals.flash = req.session.flash || null;
  res.locals.inventoryModalState = req.session.inventoryModalState || null;
  res.locals.formatCurrency = formatCurrency;
  res.locals.formatDateTime = formatDateTime;
  res.locals.formatInvoice = formatInvoice;
  res.locals.notifications = { lowStockItems: [], overStockItems: [], count: 0 };

  delete req.session.flash;
  delete req.session.inventoryModalState;

  if (!req.session.user) {
    return next();
  }

  try {
    res.locals.notifications = await getStockNotifications();
  } catch (error) {
    console.error("Failed to load stock notifications:", error.message);
  }

  return next();
}

module.exports = {
  setViewLocals
};
