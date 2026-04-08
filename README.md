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
|-- .env
|-- package.json
`-- package-lock.json
```

## Main Features

- Login-protected dashboard pages
- Inventory table with searchable items
- Add item modal with barcode scan and image upload support
- Add category modal with duplicate-category protection
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
- Item history hub page per item
- Read-only item detail pages
- Global history page
- Live price lookup page
- Transaction page with payment modal and stock deduction
- Reports page with transaction detail modal
- Global stock notifications modal
- Session-based feedback modal for success and error messages

## Folder Guide

- `api`: JSON endpoints used by frontend features.
- `auth`: Login and logout routes.
- `dashboard`: Main page routes for inventory, transaction, history, price lookup, and reports.
- `database`: MySQL pool setup and starter SQL schema.
- `includes`: Shared helpers such as flash messages and formatters.
- `middleware`: Authentication checks and shared view locals.
- `public/css`: App-wide styles.
- `public/js/ui`: Split frontend scripts for focused UI behavior.
- `views/components/modals`: Reusable modal partials.
- `views/dashboard`: Main EJS page templates.
- `views/includes`: Shared page shell partials.

## Setup

1. Install Node.js.
2. Run `npm install`.
3. Create a `.env` file.
4. Set your database values in `.env`.
5. Import [database.sql](/c:/Users/JESAMINE/Desktop/twojs/database/database.sql) into MySQL.
6. Run `npm start`.
7. Open `https://localhost:4000`.

## Example `.env`

```env
PORT=4000
HOST=0.0.0.0
DB_HOST=localhost
DB_PORT=3306
DB_NAME=twojs
DB_USER=root
DB_PASSWORD=
SESSION_SECRET=change-this-secret
SSL_KEY_PATH=certs/localhost-key.pem
SSL_CERT_PATH=certs/localhost.pem
```

## Available Scripts

- `npm start`: Start the HTTPS server.
- `npm run dev`: Start the app with Node watch mode.

## Mobile Testing

### Android or iPhone on the same Wi-Fi

1. Start the app with `npm start`.
2. Check the terminal output for your LAN URL such as `https://192.168.x.x:4000`.
3. Open that URL on your phone.

If the phone cannot connect:

- Make sure the phone and PC are on the same network.
- Make sure Windows Firewall allows port `4000`.
- Keep the app running while testing.
- If you changed `PORT`, use that port instead.

## Notes

- The server checks the database connection before it starts accepting requests.
- Static files are served from `/public`.
- Sessions use secure cookies because the app runs on HTTPS.
- Flash messages are displayed through a shared modal instead of an inline banner.
- Item detail and item history pages are read-only. Inventory field changes are handled through the `Adjustments` page.
- The adjustments page only toggles row selection from the `Select`, `Item Number`, and `Name` columns.
- iPhone input zoom has been reduced by enforcing a 16px font size on editable mobile fields.
