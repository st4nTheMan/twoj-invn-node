const mysql = require("mysql2/promise");

// Centralized MySQL connection settings used across route modules.
const dbConfig = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
};

// Shared connection pool for all database reads and writes in the app.
const pool = mysql.createPool(dbConfig);

module.exports = pool;
