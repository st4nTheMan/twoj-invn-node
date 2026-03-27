const path = require("path");
const os = require("os");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
require("dotenv").config();

// Create the Express app and set the server address.
const app = express();
const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || "0.0.0.0";

// Set the database connection settings.
const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "admin@123",
  database: process.env.DB_NAME || "inventory_system",
  waitForConnections: true,
  connectionLimit: 10
};
const pool = mysql.createPool(dbConfig);

//
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

//
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "inventory-system-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);
app.use("/public", express.static(path.join(__dirname, "public")));

// Change a number into currency format.
function formatCurrency(value) {
  return Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// Change a date into a readable date and time.
function formatDateTime(value) {
  if (!value) return "";

  return new Date(value).toLocaleString("en-PH", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
}

// Create an invoice number.
function formatInvoice(id) {
  return `INV-${String(id).padStart(6, "0")}`;
}

//Convert text to uppercase
function toUppercaseText(value) {
  return String(value || "").trim().toUpperCase();
}

// Save a temporary message in the session.
function flash(req, payload) {
  req.session.flash = payload;
}

// Save the add item form state in the session.
function setAddItemState(req, payload) {
  req.session.addItemState = payload;
}

// Return a simple database error message.
function getDatabaseErrorMessage(error) {
  if (error?.code === "ER_ACCESS_DENIED_ERROR") {
    return "Database connection failed. Check DB_USER and DB_PASSWORD in .env.";
  }

  if (error?.code === "ER_BAD_DB_ERROR") {
    return "Database not found. Check DB_NAME in .env.";
  }

  return "";
}

// Check if the database connection is working.
async function verifyDatabaseConnection() {
  try {
    await pool.query("SELECT 1");
  } catch (error) {
    const details = getDatabaseErrorMessage(error);
    console.error("Database startup check failed:", error);

    if (details) {
      console.error(details);
    }

    process.exit(1);
  }
}

// Make sure the user is logged in.
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/login");
  }

  return next();
}

// Get stock warning notifications.
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

// Set shared data for all views before each request is handled.
app.use(async (req, res, next) => {
  res.locals.title = "Inventory System";
  res.locals.currentPath = req.path;
  res.locals.user = req.session.user || null;
  res.locals.flash = req.session.flash || null;
  res.locals.addItemState = req.session.addItemState || null;
  res.locals.formatCurrency = formatCurrency;
  res.locals.formatDateTime = formatDateTime;
  res.locals.formatInvoice = formatInvoice;
  res.locals.notifications = { lowStockItems: [], overStockItems: [], count: 0 };

  delete req.session.flash;
  delete req.session.addItemState;

  if (!req.session.user) {
    return next();
  }

  try {
    res.locals.notifications = await getStockNotifications();
  } catch (error) {
    console.error("Failed to load stock notifications:", error.message);
  }

  return next();
});

// Send users to the right starting page based on their login status.
app.get("/", (req, res) => {
  if (req.session.user) {
    return res.redirect("/inventory");
  }

  return res.redirect("/login");
});

// Show the login page if the user is not already signed in.
app.get("/login", (req, res) => {
  if (req.session.user) {
    return res.redirect("/inventory");
  }

  return res.render("login", { title: "Login" });
});

// Check the user's login details and start a session when valid.
app.post("/login", async (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");

  if (!username || !password) {
    flash(req, { type: "error", message: "Username and password are required." });
    return res.redirect("/login");
  }

  try {
    const [rows] = await pool.query(
      "SELECT * FROM users WHERE username = ? LIMIT 1",
      [username]
    );
    const user = rows[0];

    if (!user) {
      flash(req, { type: "error", message: "Incorrect username or password." });
      return res.redirect("/login");
    }

    const passwordHash = String(user.password || "");
    const legacyMd5 = crypto.createHash("md5").update(password).digest("hex");
    const isBcryptHash = passwordHash.startsWith("$2");

    const isValidPassword = isBcryptHash
      ? await bcrypt.compare(password, passwordHash)
      : passwordHash === legacyMd5;

    if (!isValidPassword) {
      flash(req, { type: "error", message: "Incorrect username or password." });
      return res.redirect("/login");
    }

    req.session.user = {
      id: user.id,
      username: user.username
    };

    return res.redirect("/inventory");
  } catch (error) {
    console.error("Login failed:", error);
    flash(req, {
      type: "error",
      message: getDatabaseErrorMessage(error) || "Unable to sign in right now."
    });
    return res.redirect("/login");
  }
});

// End the current session and return the user to the login page.
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

// Load and display the inventory page with categories and items.
app.get("/inventory", requireLogin, async (req, res) => {
  try {
    const [categories] = await pool.query(
      "SELECT * FROM categories ORDER BY category_name ASC"
    );
    const [items] = await pool.query(
      `SELECT items.*, categories.category_name
       FROM items
       LEFT JOIN categories ON items.category_id = categories.id
       ORDER BY items.id DESC`
    );

    return res.render("inventory", {
      title: "Inventory",
      categories,
      items
    });
  } catch (error) {
    console.error("Failed to load inventory:", error);
    flash(req, { type: "error", message: "Unable to load inventory." });
    return res.render("inventory", {
      title: "Inventory",
      categories: [],
      items: []
    });
  }
});

// Save a new item after validating the submitted form data.
app.post("/inventory/items", requireLogin, async (req, res) => {
  const barcode = String(req.body.barcode || "").trim();
  const name = toUppercaseText(req.body.name);
  const cost = String(req.body.cost || "").trim();
  const price = String(req.body.price || "").trim();
  const quantity = Number(req.body.quantity || 0);
  const minQuantity = Number(req.body.min_quantity || 0);
  const maxQuantity = Number(req.body.max_quantity || 1);
  const categoryId = req.body.category_id ? Number(req.body.category_id) : null;

  setAddItemState(req, {
    openModal: "add-item-modal",
    error: "",
    old: {
      barcode,
      name,
      cost,
      price,
      quantity,
      min_quantity: minQuantity,
      max_quantity: maxQuantity,
      category_id: categoryId || ""
    }
  });

  if (!barcode || !name || !cost || !price) {
    req.session.addItemState.error = "Item number, name, cost, and price are required.";
    return res.redirect("/inventory");
  }

  if (maxQuantity < minQuantity) {
    req.session.addItemState.error = "Maximum quantity must be greater than or equal to minimum quantity.";
    return res.redirect("/inventory");
  }

  try {
    const [existing] = await pool.query(
      "SELECT COUNT(*) AS count FROM items WHERE barcode = ?",
      [barcode]
    );

    if (existing[0].count > 0) {
      req.session.addItemState.error = "Item number already exists.";
      return res.redirect("/inventory");
    }

    await pool.query(
      `INSERT INTO items (barcode, name, cost, price, quantity, min_quantity, max_quantity, category_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [barcode, name, cost, price, quantity, minQuantity, maxQuantity, categoryId]
    );

    delete req.session.addItemState;
    flash(req, { type: "success", message: "Item added successfully." });
    return res.redirect("/inventory");
  } catch (error) {
    console.error("Failed to save item:", error);
    req.session.addItemState.error = "Unable to save item right now.";
    return res.redirect("/inventory");
  }
});

// Update an existing item's details after validation.
app.post("/inventory/items/:id", requireLogin, async (req, res) => {
  const id = Number(req.params.id);
  const barcode = String(req.body.barcode || "").trim();
  const name = toUppercaseText(req.body.name);
  const cost = String(req.body.cost || "").trim();
  const price = String(req.body.price || "").trim();
  const quantity = Number(req.body.quantity || 0);
  const minQuantity = Number(req.body.min_quantity || 0);
  const maxQuantity = Number(req.body.max_quantity || 1);
  const categoryId = req.body.category_id ? Number(req.body.category_id) : null;

  if (!id || !barcode || !name || !cost || !price) {
    flash(req, { type: "error", message: "Missing required item fields." });
    return res.redirect("/inventory");
  }

  if (maxQuantity < minQuantity) {
    flash(req, { type: "error", message: "Maximum quantity must be greater than or equal to minimum quantity." });
    return res.redirect("/inventory");
  }

  try {
    const [existing] = await pool.query(
      "SELECT COUNT(*) AS count FROM items WHERE barcode = ? AND id != ?",
      [barcode, id]
    );

    if (existing[0].count > 0) {
      flash(req, { type: "error", message: "Item number already exists." });
      return res.redirect("/inventory");
    }

    await pool.query(
      `UPDATE items
       SET barcode = ?, name = ?, cost = ?, price = ?, quantity = ?, min_quantity = ?, max_quantity = ?, category_id = ?
       WHERE id = ?`,
      [barcode, name, cost, price, quantity, minQuantity, maxQuantity, categoryId, id]
    );

    flash(req, { type: "success", message: "Item updated successfully." });
    return res.redirect("/inventory");
  } catch (error) {
    console.error("Failed to update item:", error);
    flash(req, { type: "error", message: "Unable to update item right now." });
    return res.redirect("/inventory");
  }
});

// Save a new category from the inventory page form.
app.post("/inventory/categories", requireLogin, async (req, res) => {
  const categoryName = toUppercaseText(req.body.category_name);

  if (!categoryName) {
    flash(req, { type: "error", message: "Category name is required." });
    return res.redirect("/inventory");
  }

  try {
    await pool.query(
      "INSERT IGNORE INTO categories (category_name) VALUES (?)",
      [categoryName]
    );

    flash(req, { type: "success", message: "Category saved successfully." });
    return res.redirect("/inventory");
  } catch (error) {
    console.error("Failed to save category:", error);
    flash(req, { type: "error", message: "Unable to save category right now." });
    return res.redirect("/inventory");
  }
});

// Load the transaction page with the list of available items.
app.get("/transaction", requireLogin, async (req, res) => {
  try {
    const [items] = await pool.query(
      `SELECT items.*, categories.category_name
       FROM items
       LEFT JOIN categories ON items.category_id = categories.id
       ORDER BY items.name ASC`
    );

    return res.render("transaction", {
      title: "Transaction",
      items
    });
  } catch (error) {
    console.error("Failed to load transaction page:", error);
    flash(req, { type: "error", message: "Unable to load transactions." });
    return res.render("transaction", {
      title: "Transaction",
      items: []
    });
  }
});

// Process a checkout transaction and reduce item stock levels.
app.post("/transaction", requireLogin, async (req, res) => {
  const itemIds = Array.isArray(req.body.item_id)
    ? req.body.item_id
    : req.body.item_id
      ? [req.body.item_id]
      : [];
  const prices = Array.isArray(req.body.price)
    ? req.body.price
    : req.body.price
      ? [req.body.price]
      : [];
  const quantities = Array.isArray(req.body.quantity)
    ? req.body.quantity
    : req.body.quantity
      ? [req.body.quantity]
      : [];

  if (!itemIds.length) {
    flash(req, { type: "error", message: "Select at least one item before checkout." });
    return res.redirect("/transaction");
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    let totalAmount = 0;

    for (let index = 0; index < itemIds.length; index += 1) {
      const itemId = Number(itemIds[index]);
      const price = Number(prices[index]);
      const qty = Number(quantities[index]);

      if (!itemId || qty <= 0) {
        throw new Error("Invalid transaction payload.");
      }

      const [rows] = await connection.query(
        "SELECT quantity FROM items WHERE id = ? LIMIT 1",
        [itemId]
      );
      const item = rows[0];

      if (!item) {
        throw new Error("Item not found.");
      }

      if (Number(item.quantity) < qty) {
        throw new Error("Not enough stock available.");
      }

      totalAmount += price * qty;
    }

    const [transactionResult] = await connection.query(
      "INSERT INTO transactions (total_amount) VALUES (?)",
      [totalAmount]
    );

    const transactionId = transactionResult.insertId;

    for (let index = 0; index < itemIds.length; index += 1) {
      const itemId = Number(itemIds[index]);
      const price = Number(prices[index]);
      const qty = Number(quantities[index]);
      const subtotal = price * qty;

      await connection.query(
        `INSERT INTO transaction_items (transaction_id, item_id, price, quantity, subtotal)
         VALUES (?, ?, ?, ?, ?)`,
        [transactionId, itemId, price, qty, subtotal]
      );

      await connection.query(
        "UPDATE items SET quantity = quantity - ? WHERE id = ?",
        [qty, itemId]
      );
    }

    await connection.commit();
    flash(req, { type: "success", message: `Transaction ${formatInvoice(transactionId)} completed.` });
    return res.redirect("/transaction");
  } catch (error) {
    await connection.rollback();
    console.error("Transaction failed:", error);
    flash(req, { type: "error", message: error.message || "Transaction failed." });
    return res.redirect("/transaction");
  } finally {
    connection.release();
  }
});

// Show the reports page with the list of completed transactions.
app.get("/reports", requireLogin, async (req, res) => {
  try {
    const [transactions] = await pool.query(
      `SELECT *
       FROM transactions
       ORDER BY created_at DESC, id DESC`
    );

    return res.render("reports", {
      title: "Reports",
      transactions
    });
  } catch (error) {
    console.error("Failed to load reports:", error);
    flash(req, { type: "error", message: "Unable to load reports." });
    return res.render("reports", {
      title: "Reports",
      transactions: []
    });
  }
});

// Return the items that belong to a selected transaction report.
app.get("/reports/:id/items", requireLogin, async (req, res) => {
  const transactionId = Number(req.params.id);

  if (!transactionId) {
    return res.json([]);
  }

  try {
    const [items] = await pool.query(
      `SELECT transaction_items.*, items.barcode, items.name
       FROM transaction_items
       INNER JOIN items ON transaction_items.item_id = items.id
       WHERE transaction_items.transaction_id = ?
       ORDER BY transaction_items.id ASC`,
      [transactionId]
    );

    return res.json(items);
  } catch (error) {
    console.error("Failed to load report details:", error);
    return res.status(500).json([]);
  }
});

// Show the details page for a single inventory item.
app.get("/inventory/items/:id", requireLogin, async (req, res) => {
  const id = Number(req.params.id);

  if (!id) {
    flash(req, { type: "error", message: "Item not found." });
    return res.redirect("/inventory");
  }

  try {
    const [categories] = await pool.query(
      "SELECT * FROM categories ORDER BY category_name ASC"
    );
    const [rows] = await pool.query(
      `SELECT items.*, categories.category_name
       FROM items
       LEFT JOIN categories ON items.category_id = categories.id
       WHERE items.id = ?
       LIMIT 1`,
      [id]
    );
    const item = rows[0];

    if (!item) {
      flash(req, { type: "error", message: "Item not found." });
      return res.redirect("/inventory");
    }

    return res.render("view-item", {
      title: "View Item",
      item,
      categories
    });
  } catch (error) {
    console.error("Failed to load item details:", error);
    flash(req, { type: "error", message: "Unable to load item details." });
    return res.redirect("/inventory");
  }
});

// Load the cost adjustment page and its change history for one item.
app.get("/inventory/items/:id/cost", requireLogin, async (req, res) => {
  const id = Number(req.params.id);

  if (!id) {
    return res.redirect("/inventory");
  }

  try {
    const itemPromise = pool.query("SELECT * FROM items WHERE id = ? LIMIT 1", [id]);
    const historyPromise = pool.query(
      "SELECT * FROM cost_adjustments WHERE item_id = ? ORDER BY adjusted_at DESC",
      [id]
    );
    const [itemResult, historyResult] = await Promise.all([itemPromise, historyPromise]);
    const item = itemResult[0][0];
    const historyList = historyResult[0];

    if (!item) {
      flash(req, { type: "error", message: "Item not found." });
      return res.redirect("/inventory");
    }

    return res.render("adjust-cost", {
      title: "Adjust Cost",
      item,
      historyList
    });
  } catch (error) {
    console.error("Failed to load cost adjustment page:", error);
    flash(req, { type: "error", message: "Unable to load cost history." });
    return res.redirect("/inventory");
  }
});

// Update the cost of an item and save the adjustment history.
app.post("/inventory/items/:id/cost", requireLogin, async (req, res) => {
  const id = Number(req.params.id);
  const newCost = Number(req.body.new_cost);

  if (!id || Number.isNaN(newCost) || newCost < 0) {
    flash(req, { type: "error", message: "Please enter a valid cost." });
    return res.redirect(`/inventory/items/${id}/cost`);
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      "SELECT * FROM items WHERE id = ? LIMIT 1",
      [id]
    );
    const item = rows[0];

    if (!item) {
      throw new Error("Item not found.");
    }

    await connection.query(
      "UPDATE items SET cost = ? WHERE id = ?",
      [newCost, id]
    );
    await connection.query(
      "INSERT INTO cost_adjustments (item_id, old_cost, new_cost) VALUES (?, ?, ?)",
      [id, item.cost, newCost]
    );

    await connection.commit();
    flash(req, { type: "success", message: "Cost updated successfully." });
    return res.redirect(`/inventory/items/${id}/cost`);
  } catch (error) {
    await connection.rollback();
    console.error("Failed to update cost:", error);
    flash(req, { type: "error", message: error.message || "Unable to update cost." });
    return res.redirect(`/inventory/items/${id}/cost`);
  } finally {
    connection.release();
  }
});

// Load the price adjustment page and its change history for one item.
app.get("/inventory/items/:id/price", requireLogin, async (req, res) => {
  const id = Number(req.params.id);

  if (!id) {
    return res.redirect("/inventory");
  }

  try {
    const itemPromise = pool.query("SELECT * FROM items WHERE id = ? LIMIT 1", [id]);
    const historyPromise = pool.query(
      "SELECT * FROM price_adjustments WHERE item_id = ? ORDER BY adjusted_at DESC",
      [id]
    );
    const [itemResult, historyResult] = await Promise.all([itemPromise, historyPromise]);
    const item = itemResult[0][0];
    const historyList = historyResult[0];

    if (!item) {
      flash(req, { type: "error", message: "Item not found." });
      return res.redirect("/inventory");
    }

    return res.render("adjust-price", {
      title: "Adjust Price",
      item,
      historyList
    });
  } catch (error) {
    console.error("Failed to load price adjustment page:", error);
    flash(req, { type: "error", message: "Unable to load price history." });
    return res.redirect("/inventory");
  }
});

// Update the price of an item and save the adjustment history.
app.post("/inventory/items/:id/price", requireLogin, async (req, res) => {
  const id = Number(req.params.id);
  const newPrice = Number(req.body.new_price);

  if (!id || Number.isNaN(newPrice) || newPrice < 0) {
    flash(req, { type: "error", message: "Please enter a valid price." });
    return res.redirect(`/inventory/items/${id}/price`);
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      "SELECT * FROM items WHERE id = ? LIMIT 1",
      [id]
    );
    const item = rows[0];

    if (!item) {
      throw new Error("Item not found.");
    }

    await connection.query(
      "UPDATE items SET price = ? WHERE id = ?",
      [newPrice, id]
    );
    await connection.query(
      "INSERT INTO price_adjustments (item_id, old_price, new_price) VALUES (?, ?, ?)",
      [id, item.price, newPrice]
    );

    await connection.commit();
    flash(req, { type: "success", message: "Price updated successfully." });
    return res.redirect(`/inventory/items/${id}/price`);
  } catch (error) {
    await connection.rollback();
    console.error("Failed to update price:", error);
    flash(req, { type: "error", message: error.message || "Unable to update price." });
    return res.redirect(`/inventory/items/${id}/price`);
  } finally {
    connection.release();
  }
});

// Show the custom 404 page for routes that do not exist.
app.use((req, res) => {
  res.status(404).render("404", { title: "Page Not Found" });
});

// Start the server after checking the database.
async function startServer() {
  await verifyDatabaseConnection();

  app.listen(PORT, HOST, () => {
    console.log(`Inventory system running at http://localhost:${PORT}`);

    const networkInterfaces = os.networkInterfaces();
    const lanAddresses = [];

    for (const addresses of Object.values(networkInterfaces)) {
      for (const address of addresses || []) {
        if (address.family === "IPv4" && !address.internal) {
          lanAddresses.push(address.address);
        }
      }
    }

    if (lanAddresses.length) {
      console.log("Open from your phone using one of these URLs:");
      for (const address of lanAddresses) {
        console.log(`http://${address}:${PORT}`);
      }
    }
  });
}

//
startServer();
