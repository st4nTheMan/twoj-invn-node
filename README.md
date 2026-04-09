# two-js-invn

Inventory system built with Node.js, Express, EJS, MySQL, and Tailwind CSS.

## Overview

This app covers:

- Login/logout with session-based auth
- Inventory listing and price lookup
- Add item and add category modals
- Bulk inventory adjustments
- Item history pages
- Transaction checkout
- Sales reports with detail modal
- Stock notification modal

Most save/update actions now submit without refreshing the page. The UI stays in place and shows the shared feedback popup after success or failure.

## Stack

- Node.js
- Express
- EJS
- MySQL
- `express-session`
- Tailwind CSS via CDN
- QuaggaJS CDN for barcode scanning

## Scripts

- `npm start`: start the app
- `npm run dev`: start the app in watch mode

## Project Structure

```text
two-js-invn/
|-- app.js
|-- api/
|   `-- routes.js
|-- auth/
|   `-- routes.js
|-- dashboard/
|   |-- inventory.routes.js
|   |-- reports.routes.js
|   |-- routes.js
|   `-- transaction.routes.js
|-- database/
|   |-- database.sql
|   `-- pool.js
|-- includes/
|   `-- helpers.js
|-- middleware/
|   |-- auth.js
|   `-- view-locals.js
|-- public/
|   |-- css/
|   |   `-- app.css
|   `-- js/
|       `-- ui/
|           |-- adjustments.js
|           |-- barcode-scanner.js
|           |-- core.js
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
|   |       |-- add-item.ejs
|   |       |-- barcode-scanner.ejs
|   |       |-- exclude-adjustment-row.ejs
|   |       |-- flash-feedback.ejs
|   |       |-- out-of-stock.ejs
|   |       |-- report-details.ejs
|   |       |-- stock-notifications.ejs
|   |       `-- transaction-payment.ejs
|   |-- dashboard/
|   |   |-- 404.ejs
|   |   |-- adjust-cost.ejs
|   |   |-- adjust-min-max.ejs
|   |   |-- adjust-price.ejs
|   |   |-- adjust-quantity.ejs
|   |   |-- adjustments.ejs
|   |   |-- history.ejs
|   |   |-- inventory.ejs
|   |   |-- item-history.ejs
|   |   |-- price-lookup.ejs
|   |   |-- reports.ejs
|   |   |-- transaction.ejs
|   |   `-- view-item.ejs
|   `-- includes/
|       |-- footer.ejs
|       `-- header.ejs
|-- package.json
`-- package-lock.json
```

## Folder Guide

- `api`: JSON endpoints used by report details and async UI flows.
- `auth`: login/logout routes.
- `dashboard`: page routes for inventory, adjustments, history, transactions, and reports.
- `database`: SQL schema and MySQL pool setup.
- `includes`: shared server helpers.
- `middleware`: auth guard and shared EJS locals.
- `public`: CSS and browser-side UI logic.
- `views/components/modals`: reusable modal partials.
- `views/dashboard`: main page templates.
- `views/includes`: shared page shell.

## Key UI Behavior

- Inventory add/update actions use modal-driven async saves.
- Adjustments save in place and update the edited rows without a page reload.
- Transactions complete from the payment modal and update stock in place.
- Reports load transaction details on demand inside a modal.
- Shared feedback messages use the global flash-feedback modal.

## Setup

1. Install Node.js.
2. Create a `.env` file if you do not have one yet.
3. Set your database values in `.env`.
4. Make sure `DB_USER`, `DB_PASSWORD`, and `DB_NAME` point to a valid MySQL database.
5. Import [database/database.sql](/c:/Users/OJT-ITDT.174/Desktop/tindahan/database/database.sql).
6. Run `npm install`.
7. Run `npm start`.
8. Open `http://localhost:4000`.

## Access From Phone

1. Connect your PC and phone to the same network.
2. Start the app with `npm start`.
3. Check the terminal output for the LAN URL.
4. Open that URL on your phone.

If it does not connect:

- Allow inbound access through Windows Firewall for the app or port.
- Keep the Node server running while testing.
- If you changed the port in `.env`, use that port instead of `4000`.

## Notes

- Tailwind is loaded from CDN, so there is no separate frontend build step.
- Page-specific UI scripts are only loaded where they are needed.
- The app still supports normal server redirects as a fallback, but the main inventory, adjustment, and transaction saves are now async.
