-- Create the database if it does not already exist.
CREATE DATABASE IF NOT EXISTS inventory_system
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Switch to the inventory database.
USE inventory_system;

-- Use UTF-8 encoding for the current connection.
SET NAMES utf8mb4;

-- Drop dependent tables first so the schema can be recreated cleanly.
DROP TABLE IF EXISTS price_adjustments;
DROP TABLE IF EXISTS min_max_adjustments;
DROP TABLE IF EXISTS quantity_adjustments;
-- Drop the cost history table before recreating it.
DROP TABLE IF EXISTS cost_adjustments;
-- Drop the transaction item details table before recreating it.
DROP TABLE IF EXISTS transaction_items;
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
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_items_barcode (barcode),
  KEY idx_items_category_id (category_id),
  CONSTRAINT fk_items_category
    FOREIGN KEY (category_id) REFERENCES categories (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Store each completed sale transaction.
CREATE TABLE transactions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
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
  adjusted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cost_adjustments_item_id (item_id),
  CONSTRAINT fk_cost_adjustments_item
    FOREIGN KEY (item_id) REFERENCES items (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Store the history of item on-hand quantity changes.
CREATE TABLE quantity_adjustments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  item_id INT UNSIGNED NOT NULL,
  old_quantity INT NOT NULL DEFAULT 0,
  new_quantity INT NOT NULL DEFAULT 0,
  adjusted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_quantity_adjustments_item_id (item_id),
  CONSTRAINT fk_quantity_adjustments_item
    FOREIGN KEY (item_id) REFERENCES items (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Store the history of item minimum and maximum quantity changes.
CREATE TABLE min_max_adjustments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  item_id INT UNSIGNED NOT NULL,
  old_min_quantity INT NOT NULL DEFAULT 0,
  new_min_quantity INT NOT NULL DEFAULT 0,
  old_max_quantity INT NOT NULL DEFAULT 0,
  new_max_quantity INT NOT NULL DEFAULT 0,
  adjusted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_min_max_adjustments_item_id (item_id),
  CONSTRAINT fk_min_max_adjustments_item
    FOREIGN KEY (item_id) REFERENCES items (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Store the history of item price changes.
CREATE TABLE price_adjustments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  item_id INT UNSIGNED NOT NULL,
  old_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  new_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  adjusted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_price_adjustments_item_id (item_id),
  CONSTRAINT fk_price_adjustments_item
    FOREIGN KEY (item_id) REFERENCES items (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add the default admin account for first-time login.
INSERT INTO users (username, password) VALUES
  ('admin', MD5('admin123'));

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
