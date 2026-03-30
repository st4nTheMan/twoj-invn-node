# two-js-invn

This project is a Node.js inventory system built with Express, EJS, MySQL, and Tailwind CSS. It has been refactored into the same modular structure used in the `tindahan` project.

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
|   `-- pool.js
|-- db/
|   `-- database.sql
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
|           |-- barcode-scanner.js
|           |-- core.js
|           |-- forms.js
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
|   |       |-- out-of-stock.ejs
|   |       |-- report-details.ejs
|   |       `-- stock-notifications.ejs
|   |-- dashboard/
|   |   |-- 404.ejs
|   |   |-- adjust-cost.ejs
|   |   |-- adjust-price.ejs
|   |   |-- inventory.ejs
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

- `api`: JSON endpoints used by the dashboard UI.
- `auth`: Login, logout, and session-related routes.
- `certs`: Local HTTPS certificate files used by the development server.
- `dashboard`: Inventory, transaction, and report page routes.
- `database`: Shared MySQL pool setup.
- `db`: SQL file for the database schema.
- `includes`: Shared helper functions.
- `middleware`: Authentication and shared view-local middleware.
- `public`: Frontend CSS and split browser-side JavaScript modules.
- `views/auth`: Authentication templates.
- `views/components/modals`: Reusable modal partials.
- `views/dashboard`: Main dashboard page templates.
- `views/includes`: Shared header and footer partials.

## Stack

- Node.js
- Express
- EJS
- MySQL
- `express-session`
- Tailwind CSS via CDN
- HTTPS local server

## Included Features

- Login and logout
- Inventory list
- Add item
- Add category
- Stock notifications
- Barcode scanning and barcode image upload
- Transaction checkout with stock deduction
- Sales reports with detail modal
- Price adjustment history
- Cost adjustment history

## Setup

1. Install Node.js.
2. Create a `.env` file if you do not have one yet.
3. Update the database values in `.env`.
4. Set `DB_USER` and `DB_PASSWORD` to a MySQL account that can access `DB_NAME`.
5. If your local MySQL `root` user has a password, put that value in `DB_PASSWORD`. Leaving it blank makes the app connect with no password.
6. Import [database.sql](/c:/xampp/htdocs/two-js-invn/db/database.sql) into MySQL if needed.
7. Run `npm install`
8. Run `npm start`
9. Open `http://localhost:3000`

## Access From Android Phone

1. Make sure your PC and Android phone are connected to the same Wi-Fi network.
2. Start the app with `npm start`.
3. Check the terminal for a message like `http://192.168.x.x:3000`.
4. Open that URL in your Android phone's browser.

If the phone cannot connect:

- Make sure Windows Firewall allows inbound access on port `4000`.
- Keep the app running on your PC while using the phone.
- If you changed the port in `.env`, use that port instead of `3000`.

## Notes

- Tailwind is loaded from the CDN, so there is no separate build step.
- The backend is split into `auth`, `dashboard`, `api`, `database`, `middleware`, and `includes`.
- The dashboard routes are split into focused route files instead of one large server file.
- The browser UI logic is split into focused scripts inside `public/js/ui`.
- The views are organized into `views/auth`, `views/dashboard`, `views/components/modals`, and `views/includes`.
