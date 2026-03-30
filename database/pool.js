const mysql = require("mysql2/promise");

// Centralized MySQL connection settings used across route modules.
const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "admin@123",
  database: process.env.DB_NAME || "inventory_system",
  waitForConnections: true,
  connectionLimit: 10
};

// Shared connection pool for all database reads and writes in the app.
const pool = mysql.createPool(dbConfig);

module.exports = pool;
