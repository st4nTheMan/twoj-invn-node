# two-js-invn

Node.js inventory system for Two J's Store built with Express, EJS, MySQL, and Tailwind CSS via CDN.

## Overview

This app handles:

- Inventory listing and item creation
- Category creation
- Bulk inventory adjustments
- Read-only item and history pages
- Price lookup
- Transaction checkout
- Sales reports
- Credit ledger tracking
- Global stock notifications
- Reusable modals for forms, alerts, and feedback

The app runs over local HTTPS so barcode scanning and phone testing work more reliably on the same network.

## Stack

- Node.js
- Express
- EJS
- MySQL with `mysql2`
- `express-session`
- Tailwind CSS via CDN
- Browser-side JavaScript modules in `public/js/ui`

## Project Structure

```text
two-js-invn/
|-- app.js
|-- api/
|   `-- routes.js
|-- auth/
|   `-- routes.js
|-- certs/
|   |-- localhost-key.pem
|   `-- localhost.pem
|-- dashboard/
|   |-- admin.routes.js
|   |-- credit-ledger.routes.js
|   |-- inventory.routes.js
|   |-- reports.routes.js
|   |-- routes.js
|   |-- transaction.routes.js
|-- database/
|   |-- activity-log.js
|   |-- database.sql
|   |-- pool.js
|   `-- schema-bootstrap.js
|-- includes/
|   |-- customers.js
|   |-- helpers.js
|   `-- permissions.js
|-- middleware/
|   |-- auth.js
|   `-- view-locals.js
|-- public/
|   |-- css/
|   |   `-- app.css
|   `-- js/
|       `-- ui/
|           |-- adjustments.js
|           |-- admin.js
|           |-- barcode-scanner.js
|           |-- core.js
|           |-- credit-ledger.js
|           |-- forms.js
|           |-- inventory.js
|           |-- mobile-nav.js
|           |-- modals.js
|           |-- reports.js
|           |-- search.js
|           `-- transactions.js
|-- views/
|   |-- auth/
|   |   `-- login.ejs
|   |-- components/
|   |   `-- modals/
|   |       |-- add-category.ejs
|   |       |-- add-credit-ledger.ejs
|   |       |-- add-item.ejs
|   |       |-- add-role.ejs
|   |       |-- add-user.ejs
|   |       |-- archive-item-confirm.ejs
|   |       |-- archived-items.ejs
|   |       |-- barcode-scanner.ejs
|   |       |-- credit-ledger-items.ejs
|   |       |-- exclude-adjustment-row.ejs
|   |       |-- export-inventory.ejs
|   |       |-- flash-feedback.ejs
|   |       |-- manage-app-backup.ejs
|   |       |-- out-of-stock.ejs
|   |       |-- report-details.ejs
|   |       |-- reset-user-password.ejs
|   |       |-- settle-credit-balance.ejs
|   |       |-- stock-notifications.ejs
|   |       |-- transaction-payment.ejs
|   |       |-- view-item.ejs
|   |       `-- view-role-permissions.ejs
|   |-- dashboard/
|   |   |-- 404.ejs
|   |   |-- activity-logs.ejs
|   |   |-- adjust-category.ejs
|   |   |-- adjust-cost.ejs
|   |   |-- adjust-min-max.ejs
|   |   |-- adjust-price.ejs
|   |   |-- adjust-quantity.ejs
|   |   |-- adjustments.ejs
|   |   |-- admin.ejs
|   |   |-- credit-ledger.ejs
|   |   |-- history.ejs
|   |   |-- inventory.ejs
|   |   |-- item-history.ejs
|   |   |-- price-lookup.ejs
|   |   |-- reports.ejs
|   |   `-- transaction.ejs
|   `-- includes/
|       |-- footer.ejs
|       `-- header.ejs
|-- .env.example
|-- package.json
`-- package-lock.json
```

## Main Features

- Login-protected dashboard with role-based permissions
- Inventory table with server-side pagination and AJAX live search
- Add item modal with barcode scan and image upload support
- Add category modal with duplicate-category protection
- Item archive and restore
- Inventory CSV and XLS export
- Bulk adjustments for:
  - OH quantity
  - Min/max quantity
  - Cost
  - Price
  - Category
- Adjustment history pages for:
  - OH quantity
  - Min/max quantity
  - Cost
  - Price
  - Category
- Item history hub page per item
- Global history page with server-side pagination and AJAX live search
- Live price lookup page with server-side pagination and AJAX live search
- Transaction page with payment modal and stock deduction
- Reports page with server-side pagination, AJAX live search, and transaction detail modal
- Credit ledger page with server-side pagination and AJAX live search
- Customer balance tracking and credit settlement
- Admin panel for user and role management
- Activity log tracking
- Global stock notifications modal
- Session-based feedback modal for success and error messages

## Pagination and Search

Pages with large datasets use server-side pagination with 25 items per page. Each paginated page also supports AJAX live search — results and pagination controls update in place as you type without a full page reload. Search is preserved across page navigation.

Pages with pagination and AJAX search:

- Inventory
- History
- Price Lookup
- Reports
- Credit Ledger (entries table)

The Adjustments page intentionally loads all items without pagination so that multiple items can be checked and bulk-saved in a single operation.

## Folder Guide

- `api`: JSON endpoints used by frontend features.
- `auth`: Login and logout routes.
- `dashboard`: Main page routes for inventory, adjustments, history, price lookup, reports, credit ledger, transactions, and admin.
- `database`: MySQL pool setup, activity logger, and starter SQL schema.
- `includes`: Shared helpers including flash messages, formatters, pagination builder, customer resolver, and permission utilities.
- `middleware`: Authentication checks and shared view locals.
- `public/css`: App-wide styles.
- `public/js/ui`: Split frontend scripts for focused UI behavior.
- `views/components/modals`: Reusable modal partials.
- `views/dashboard`: Main EJS page templates.
- `views/includes`: Shared page shell partials.

## Setup

1. Install Node.js.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and fill in your values.
4. Import `database/database.sql` into MySQL.
5. Run `npm start`.
6. Open `https://localhost:4000`.

## Example `.env`

```env
PORT=4000
HOST=0.0.0.0
DB_HOST=localhost
DB_PORT=3306
DB_NAME=twojs
DB_USER=root
DB_PASSWORD=your_password
SESSION_SECRET=change-this-secret
SSL_KEY_PATH=certs/localhost-key.pem
SSL_CERT_PATH=certs/localhost.pem
```

## Available Scripts

- `npm start`: Start the HTTPS server.
- `npm run dev`: Start the app with Node watch mode.

## Notes

- The server checks the database connection before it starts accepting requests.
- Static files are served from `/public`.
- Sessions use secure cookies because the app runs on HTTPS.
- Flash messages are displayed through a shared modal instead of an inline banner.
- Item detail and item history pages are read-only. Inventory field changes are handled through the Adjustments page.
- The adjustments page only toggles row selection from the `Select`, `Item Number`, and `Name` columns.
- Pagination and AJAX search share a single reusable `bindAjaxTable` function in `search.js` and a shared `buildPaginationHtml` helper in `helpers.js` to avoid duplication across pages.
- The `buildPagination` helper in `helpers.js` centralizes page offset and metadata calculation for all paginated routes.
- iPhone input zoom has been reduced by enforcing a 16px font size on editable mobile fields.
