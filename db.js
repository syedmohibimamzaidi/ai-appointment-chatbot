import { randomUUID } from "crypto";
import sqlite3 from "sqlite3";

sqlite3.verbose();

const DB_PATH = "./app.db";
export const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(`PRAGMA foreign_keys = ON`);

  db.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      created_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      customer_id TEXT,
      name TEXT NOT NULL,
      service TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS hours (
      dow INTEGER PRIMARY KEY,
      open TEXT NOT NULL,
      close TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS blackouts (
      date TEXT PRIMARY KEY,
      note TEXT
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

export async function findCustomer(name, phone) {
  if (phone) {
    return get(
      `SELECT * FROM customers 
       WHERE LOWER(name) = LOWER(?) AND phone = ?`,
      [name, phone],
    );
  }

  return get(
    `SELECT * FROM customers 
     WHERE LOWER(name) = LOWER(?) AND phone IS NULL`,
    [name],
  );
}

export async function createCustomer(name, phone) {
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  await run(
    `INSERT INTO customers (id, name, phone, created_at)
     VALUES (?, ?, ?, ?)`,
    [id, name, phone || null, createdAt],
  );

  return { id, name, phone: phone || null, created_at: createdAt };
}

export async function findOrCreateCustomer(name, phone) {
  const existing = await findCustomer(name, phone);
  if (existing) return existing.id;

  const created = await createCustomer(name, phone);
  return created.id;
}
