-- Create the database if it does not already exist.
CREATE DATABASE IF NOT EXISTS inventory_system
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Switch to the inventory database.
USE inventory_system;

-- Use UTF-8 encoding for the current connection.
SET NAMES utf8mb4;

-- Allow full teardown even if older schema variants still reference these tables.
SET FOREIGN_KEY_CHECKS = 0;

-- Drop dependent tables first so the schema can be recreated cleanly.
DROP TABLE IF EXISTS price_adjustments;
DROP TABLE IF EXISTS category_adjustments;
DROP TABLE IF EXISTS min_max_adjustments;
DROP TABLE IF EXISTS qty_adjustments;
DROP TABLE IF EXISTS quantity_adjustments;
-- Drop the cost history table before recreating it.
DROP TABLE IF EXISTS cost_adjustments;
-- Drop the transaction item details table before recreating it.
DROP TABLE IF EXISTS transaction_items;
DROP TABLE IF EXISTS credit_ledger;
-- Drop the transactions table before recreating it.
DROP TABLE IF EXISTS transactions;
-- Drop the items table before recreating it.
DROP TABLE IF EXISTS items;
-- Drop the categories table before recreating it.
DROP TABLE IF EXISTS categories;
-- Drop the users table before recreating it.
DROP TABLE IF EXISTS users;

-- Store application login accounts.
CREATE TABLE users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(50) NOT NULL,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Store item categories used in inventory forms and lists.
CREATE TABLE categories (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_category_name (category_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Store inventory items, stock levels, and category assignments.
CREATE TABLE items (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  barcode VARCHAR(100) NOT NULL,
  name VARCHAR(150) NOT NULL,
  cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  quantity INT NOT NULL DEFAULT 0,
  min_quantity INT NOT NULL DEFAULT 0,
  max_quantity INT NOT NULL DEFAULT 1,
  category_id INT UNSIGNED NULL,
  archived_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_items_barcode (barcode),
  KEY idx_items_category_id (category_id),
  KEY idx_items_archived_at (archived_at),
  CONSTRAINT fk_items_category
    FOREIGN KEY (category_id) REFERENCES categories (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Store each completed sale transaction.
CREATE TABLE transactions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  payment_method VARCHAR(20) NOT NULL DEFAULT 'cash',
  customer_name VARCHAR(150) NULL,
  customer_phone VARCHAR(50) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Store customers with outstanding credit purchases and manual ledger entries.
CREATE TABLE credit_ledger (
  id INT NOT NULL AUTO_INCREMENT,
  transaction_id INT UNSIGNED NULL,
  customer_name VARCHAR(150) NOT NULL,
  customer_phone VARCHAR(50) NOT NULL,
  item_summary TEXT NULL,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  balance_due DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_credit_ledger_transaction_id (transaction_id),
  KEY idx_credit_ledger_customer_name (customer_name),
  KEY idx_credit_ledger_created_at (created_at),
  CONSTRAINT fk_credit_ledger_transaction
    FOREIGN KEY (transaction_id) REFERENCES transactions (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Store the individual items included in each transaction.
CREATE TABLE transaction_items (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  transaction_id INT UNSIGNED NOT NULL,
  item_id INT UNSIGNED NOT NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  quantity INT NOT NULL DEFAULT 1,
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_transaction_items_transaction_id (transaction_id),
  KEY idx_transaction_items_item_id (item_id),
  CONSTRAINT fk_transaction_items_transaction
    FOREIGN KEY (transaction_id) REFERENCES transactions (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_transaction_items_item
    FOREIGN KEY (item_id) REFERENCES items (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Store the history of item cost changes.
CREATE TABLE cost_adjustments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  item_id INT UNSIGNED NOT NULL,
  old_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  new_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  adjustment_note VARCHAR(255) NULL,
  adjusted_by INT UNSIGNED NULL,
  adjusted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cost_adjustments_item_id (item_id),
  KEY idx_cost_adjustments_adjusted_by (adjusted_by),
  CONSTRAINT fk_cost_adjustments_item
    FOREIGN KEY (item_id) REFERENCES items (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_cost_adjustments_user
    FOREIGN KEY (adjusted_by) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Store the history of item on-hand quantity changes.
CREATE TABLE qty_adjustments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  item_id INT UNSIGNED NOT NULL,
  old_quantity INT NOT NULL DEFAULT 0,
  new_quantity INT NOT NULL DEFAULT 0,
  adjustment_note VARCHAR(255) NULL,
  adjusted_by INT UNSIGNED NULL,
  adjusted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_qty_adjustments_item_id (item_id),
  KEY idx_qty_adjustments_adjusted_by (adjusted_by),
  CONSTRAINT fk_qty_adjustments_item
    FOREIGN KEY (item_id) REFERENCES items (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_qty_adjustments_user
    FOREIGN KEY (adjusted_by) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Store the history of item minimum and maximum quantity changes.
CREATE TABLE min_max_adjustments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  item_id INT UNSIGNED NOT NULL,
  old_min_quantity INT NOT NULL DEFAULT 0,
  new_min_quantity INT NOT NULL DEFAULT 0,
  old_max_quantity INT NOT NULL DEFAULT 0,
  new_max_quantity INT NOT NULL DEFAULT 0,
  adjustment_note VARCHAR(255) NULL,
  adjusted_by INT UNSIGNED NULL,
  adjusted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_min_max_adjustments_item_id (item_id),
  KEY idx_min_max_adjustments_adjusted_by (adjusted_by),
  CONSTRAINT fk_min_max_adjustments_item
    FOREIGN KEY (item_id) REFERENCES items (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_min_max_adjustments_user
    FOREIGN KEY (adjusted_by) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Store the history of item price changes.
CREATE TABLE price_adjustments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  item_id INT UNSIGNED NOT NULL,
  old_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  new_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  adjustment_note VARCHAR(255) NULL,
  adjusted_by INT UNSIGNED NULL,
  adjusted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_price_adjustments_item_id (item_id),
  KEY idx_price_adjustments_adjusted_by (adjusted_by),
  CONSTRAINT fk_price_adjustments_item
    FOREIGN KEY (item_id) REFERENCES items (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_price_adjustments_user
    FOREIGN KEY (adjusted_by) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Store the history of item category changes.
CREATE TABLE category_adjustments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  item_id INT UNSIGNED NOT NULL,
  old_category_id INT UNSIGNED NULL,
  new_category_id INT UNSIGNED NULL,
  adjustment_note VARCHAR(255) NULL,
  adjusted_by INT UNSIGNED NULL,
  adjusted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_category_adjustments_item_id (item_id),
  KEY idx_category_adjustments_old_category_id (old_category_id),
  KEY idx_category_adjustments_new_category_id (new_category_id),
  KEY idx_category_adjustments_adjusted_by (adjusted_by),
  CONSTRAINT fk_category_adjustments_item
    FOREIGN KEY (item_id) REFERENCES items (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_category_adjustments_old_category
    FOREIGN KEY (old_category_id) REFERENCES categories (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_category_adjustments_new_category
    FOREIGN KEY (new_category_id) REFERENCES categories (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_category_adjustments_user
    FOREIGN KEY (adjusted_by) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add the default admin account for first-time login.
INSERT INTO users (username, password) VALUES
  ('admin', '0192023a7bbd73250516f069df18b500');

-- Add a few starter categories.
INSERT INTO categories (category_name) VALUES
  ('Beverages'),
  ('Snacks'),
  ('Household');

-- Add sample inventory items for testing and demo use.
INSERT INTO items (barcode, name, cost, price, quantity, min_quantity, max_quantity, category_id) VALUES
  ('1000001', 'Bottled Water', 10.00, 15.00, 40, 10, 100, 1),
  ('1000002', 'Chocolate Bar', 18.50, 25.00, 25, 8, 60, 2),
  ('1000003', 'Dishwashing Liquid', 55.00, 75.00, 12, 5, 30, 3);

-- Restore normal foreign key enforcement after the rebuild completes.
SET FOREIGN_KEY_CHECKS = 1;
