const mysql = require("mysql2/promise");
const fs = require('fs');

// Centralized MySQL connection settings used across route modules.
const dbConfig = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  timezone: "+00:00",
  waitForConnections: true,
  connectionLimit: 10,
  ssl: {
    ca: fs.readFileSync(process.env.DB_SSL_CA),
    rejectUnauthorized: true
  }
};

// Shared connection pool for all database reads and writes in the app.
const pool = mysql.createPool(dbConfig);

module.exports = pool;
