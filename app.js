const path = require("path");
const os = require("os");
const fs = require("fs");
const https = require("https");
const express = require("express");
const session = require("express-session");
require("dotenv").config();

const pool = require("./database/pool");
const {
  ensureActivityLogSchema,
  ensureRolesSchema,
  ensureUserRolesSchema,
  ensureArchiveSchema,
  ensureAdjustmentNotesSchema,
  ensureAdjustmentAuditSchema,
  ensureCreatedBySchema,
  ensureUpdatedBySchema,
  ensureCreditLedgerSchema,
  ensureCategoryAdjustmentSchema,
  ensureCustomerRegistrySchema
} = require("./database/schema-bootstrap");
const authRoutes = require("./auth/routes");
const dashboardRoutes = require("./dashboard/routes");
const apiRoutes = require("./api/routes");
const { getDatabaseErrorMessage } = require("./includes/helpers");
const { setViewLocals } = require("./middleware/view-locals");

// Creates the Express application and reads the runtime host/port settings.
const app = express();
const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || "0.0.0.0";
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || path.join(__dirname, "certs", "localhost-key.pem");
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || path.join(__dirname, "certs", "localhost.pem");

// Configures the EJS view engine and static asset location.
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Registers request parsing, sessions, shared view locals, and route modules.
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
      secure: true,
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);
app.use("/public", express.static(path.join(__dirname, "public")));
app.use(setViewLocals);

app.use(authRoutes);
app.use(dashboardRoutes);
app.use(apiRoutes);

// Renders the dashboard-styled 404 page for unknown routes.
app.use((req, res) => {
  res.status(404).render("dashboard/404", { title: "Page Not Found" });
});

// Confirms the database is reachable before accepting incoming requests.
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

// Starts the HTTPS server and prints local and LAN access URLs.
async function startServer() {
  await verifyDatabaseConnection();
  await ensureActivityLogSchema();
  await ensureRolesSchema();
  await ensureUserRolesSchema();
  await ensureArchiveSchema();
  await ensureAdjustmentNotesSchema();
  await ensureCreditLedgerSchema();
  await ensureCustomerRegistrySchema();
  await ensureCustomerRegistrySchema();
  await ensureCategoryAdjustmentSchema();
  await ensureAdjustmentAuditSchema();
  await ensureCreatedBySchema();
  await ensureUpdatedBySchema();

  const sslOptions = {
    key: fs.readFileSync(SSL_KEY_PATH),
    cert: fs.readFileSync(SSL_CERT_PATH)
  };

  https.createServer(sslOptions, app).listen(PORT, HOST, () => {
    console.log(`Inventory system running at https://localhost:${PORT}`);

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
      console.log("Open from your Android phone using one of these URLs:");
      for (const address of lanAddresses) {
        console.log(`https://${address}:${PORT}`);
      }
    }
  });
}

// Boots the application after all setup has been defined.
startServer();