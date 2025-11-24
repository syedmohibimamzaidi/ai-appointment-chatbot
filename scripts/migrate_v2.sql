-- ===============================
-- FINAL SCHEMA MIGRATION (v2)
-- ===============================

-- 1) SERVICES
CREATE TABLE IF NOT EXISTS services (
  id           TEXT PRIMARY KEY,
  name         TEXT UNIQUE NOT NULL,
  duration_min INTEGER NOT NULL,
  price_cents  INTEGER NOT NULL DEFAULT 0
);

-- 2) STAFF / RESOURCES
CREATE TABLE IF NOT EXISTS staff (
  id     TEXT PRIMARY KEY,
  name   TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

-- 3) HOURS
CREATE TABLE IF NOT EXISTS hours (
  dow   INTEGER NOT NULL,   -- 0=Sun ... 6=Sat
  open  TEXT NOT NULL,      -- 'HH:MM'
  close TEXT NOT NULL       -- 'HH:MM'
);

-- 4) CLOSURES / BLACKOUTS
CREATE TABLE IF NOT EXISTS blackouts (
  date  TEXT PRIMARY KEY,   -- 'YYYY-MM-DD'
  note  TEXT
);

-- 5) CUSTOMERS
CREATE TABLE IF NOT EXISTS customers (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  phone       TEXT,
  created_at  TEXT NOT NULL
);

-- 6) APPOINTMENTS EVOLUTION
ALTER TABLE appointments ADD COLUMN service_id   TEXT;
ALTER TABLE appointments ADD COLUMN staff_id     TEXT;
ALTER TABLE appointments ADD COLUMN end_time     TEXT;
ALTER TABLE appointments ADD COLUMN status       TEXT NOT NULL DEFAULT 'booked';
ALTER TABLE appointments ADD COLUMN customer_id  TEXT;

-- 7) INDEXES
CREATE INDEX IF NOT EXISTS idx_appointments_date_time
  ON appointments(date, time);

CREATE INDEX IF NOT EXISTS idx_appointments_staff
  ON appointments(staff_id, date, time);

CREATE INDEX IF NOT EXISTS idx_appointments_customer
  ON appointments(customer_id);

-- 8) BACKFILL END_TIME FOR OLDER ROWS
UPDATE appointments
SET end_time = time
WHERE end_time IS NULL;

-- 9) INITIAL SERVICE SEED
INSERT OR IGNORE INTO services(id, name, duration_min, price_cents) VALUES
  ('svc-haircut', 'haircut', 30, 3000),
  ('svc-nails',   'nails',   45, 4500);

-- 10) STAFF SEED
INSERT OR IGNORE INTO staff(id, name, active) VALUES
  ('stf-amy',   'Amy',   1),
  ('stf-bob',   'Bob',   1),
  ('stf-chris', 'Chris', 0);