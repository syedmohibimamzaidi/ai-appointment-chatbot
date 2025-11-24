import { randomUUID } from "crypto";
import sqlite3 from "sqlite3";
sqlite3.verbose();

const DB_PATH = "./app.db";
export const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      service TEXT NOT NULL,
      date TEXT NOT NULL,   -- ISO: YYYY-MM-DD
      time TEXT NOT NULL,   -- HH:MM 24h
      createdAt TEXT NOT NULL
    )
  `);
});

export function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}
export function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}
export function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

// Find an existing customer by name + phone (simple v1 logic)
export async function findCustomer(name, phone) {
  if (phone) {
    // exact match on name + phone
    return get(`SELECT * FROM customers WHERE name = ? AND phone = ?`, [
      name,
      phone,
    ]);
  }

  // no phone provided -> fall back to name + NULL phone
  return get(`SELECT * FROM customers WHERE name = ? AND phone IS NULL`, [
    name,
  ]);
}

// Create a new customer
export async function createCustomer(name, phone) {
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  await run(
    `INSERT INTO customers (id, name, phone, created_at)
     VALUES (?, ?, ?, ?)`,
    [id, name, phone || null, createdAt]
  );

  return { id, name, phone: phone || null, created_at: createdAt };
}

// Find or create customer and return their id
export async function findOrCreateCustomer(name, phone) {
  // 1) Try to find existing
  const existing = await findCustomer(name, phone);
  if (existing) return existing.id;

  // 2) Otherwise, create new
  const created = await createCustomer(name, phone);
  return created.id;
}
