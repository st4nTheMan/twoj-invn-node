# two-js-invn

This project has been migrated from PHP to a Node.js app using Express, EJS, MySQL sessions, and Tailwind CSS.

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
2. Copy `.env.example` to `.env`.
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

- Make sure Windows Firewall allows inbound access on port `3000`.
- Keep the app running on your PC while using the phone.
- If you changed the port in `.env`, use that port instead of `3000`.

## Notes

- Tailwind is loaded from the CDN so there is no separate build step.
- The original PHP files are still in the project as reference during the migration.
