const { normalizeText } = require("./helpers");

// Normalizes phone input into the +63XXXXXXXXXX format used by credit customer records.
function normalizePhilippinePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  let localNumber = digits;

  if (localNumber.startsWith("63")) {
    localNumber = localNumber.slice(2);
  }

  if (localNumber.startsWith("0")) {
    localNumber = localNumber.slice(1);
  }

  localNumber = localNumber.slice(0, 10);

  if (localNumber.length !== 10) {
    return "";
  }

  return `+63${localNumber}`;
}

// Loads an existing customer by id or creates/updates one from the provided contact details.
async function resolveCustomerRecord(databaseClient, payload = {}) {
  const customerId = Number(payload.customerId) || 0;
  const customerName = normalizeText(payload.customerName);
  const customerPhone = normalizePhilippinePhone(payload.customerPhone);

  if (customerId) {
    const [rows] = await databaseClient.query(
      `SELECT id, name, phone, address, created_at, updated_at
       FROM customers
       WHERE id = ?
       LIMIT 1`,
      [customerId]
    );

    if (rows[0]) {
      return {
        customer: rows[0],
        created: false
      };
    }
  }

  if (!customerName || !customerPhone) {
    return {
      customer: null,
      created: false
    };
  }

  const [existingRows] = await databaseClient.query(
    `SELECT id, name, phone, address, created_at, updated_at
     FROM customers
     WHERE phone = ?
     LIMIT 1`,
    [customerPhone]
  );
  const existingCustomer = existingRows[0];

  if (existingCustomer) {
    if (existingCustomer.name !== customerName) {
      await databaseClient.query(
        "UPDATE customers SET name = ? WHERE id = ?",
        [customerName, existingCustomer.id]
      );
      existingCustomer.name = customerName;
    }

    return {
      customer: existingCustomer,
      created: false
    };
  }

  const [insertResult] = await databaseClient.query(
    "INSERT INTO customers (name, phone) VALUES (?, ?)",
    [customerName, customerPhone]
  );

  return {
    customer: {
      id: insertResult.insertId,
      name: customerName,
      phone: customerPhone
    },
    created: true
  };
}

module.exports = {
  normalizePhilippinePhone,
  resolveCustomerRecord
};
