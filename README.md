# two-js-invn

This project has been migrated from PHP to a Node.js app using Express, EJS, MySQL sessions, and Tailwind CSS.

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
|   `-- pool.js
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
- `dashboard`: Feature-specific page routes for inventory, transactions, and reports plus a shared router entry.
- `database`: Shared MySQL connection pool setup.
- `includes`: Shared helper functions used across routes and middleware.
- `middleware`: Reusable request middleware for auth and shared EJS locals.
- `public`: Frontend CSS and JavaScript assets, including split dashboard UI scripts.
- `views/auth`: Authentication page templates.
- `views/components/modals`: Reusable modal partials.
- `views/dashboard`: Main dashboard page templates.
- `views/includes`: Shared EJS header and footer partials.

## Stack

- Node.js
- Express
- EJS
- MySQL
- express-session
- Tailwind CSS via CDN

## Included Features

- Login and logout
- Inventory list
- Add item
- Add category
- Stock notifications
- Transaction checkout with stock deduction
- Sales reports with detail modal
- Price adjustment history

## Setup

1. Install Node.js.
2. Create a `.env` file if you do not have one yet.
3. Update the database values in `.env`.
4. Set `DB_USER` and `DB_PASSWORD` to a MySQL account that can access `DB_NAME`.
5. If your local MySQL `root` user has a password, put that value in `DB_PASSWORD`. Leaving it blank makes the app connect with no password.
6. Import [`database/database.sql`](/c:/Users/OJT-ITDT.174/Desktop/tindahan/database/database.sql) into MySQL if needed.
7. Run `npm install`
8. Run `npm start`
9. Open `http://localhost:4000`

## Access From Android Phone

1. Make sure your PC and Android phone are connected to the same Wi-Fi network.
2. Start the app with `npm start`.
3. Check the terminal for a message like `http://192.168.x.x:4000`.
4. Open that URL in your Android phone's browser.

If the phone cannot connect:

- Make sure Windows Firewall allows inbound access on port `4000`.
- Keep the app running on your PC while using the phone.
- If you changed the port in `.env`, use that port instead of `4000`.

## Notes

- Tailwind is loaded from the CDN so there is no separate build step.
- The backend is now organized into `auth`, `dashboard`, `api`, `database`, `middleware`, and `includes`.
- The `dashboard` routes are split into `inventory.routes.js`, `transaction.routes.js`, and `reports.routes.js`.
- The browser UI logic is split into focused scripts inside `public/js/ui`.
- The views are now organized into `views/auth`, `views/dashboard`, `views/components/modals`, and `views/includes`.
