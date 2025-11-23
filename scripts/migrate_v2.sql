-- services offered (duration in minutes)
CREATE TABLE IF NOT EXISTS services (
  id           TEXT PRIMARY KEY,
  name         TEXT UNIQUE NOT NULL,
  duration_min INTEGER     NOT NULL,
  price_cents  INTEGER     NOT NULL DEFAULT 0
);

-- staff/resources; capacity is the count of active staff
CREATE TABLE IF NOT EXISTS staff (
  id     TEXT PRIMARY KEY,
  name   TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

-- optional working hours & closures (for future use)
CREATE TABLE IF NOT EXISTS hours (
  dow   INTEGER NOT NULL,     -- 0=Sun .. 6=Sat
  open  TEXT NOT NULL,        -- 'HH:MM'
  close TEXT NOT NULL         -- 'HH:MM'
);
CREATE TABLE IF NOT EXISTS blackouts (
  date  TEXT PRIMARY KEY,     -- 'YYYY-MM-DD'
  note  TEXT
);

-- evolve existing appointments table
ALTER TABLE appointments ADD COLUMN service_id TEXT;
ALTER TABLE appointments ADD COLUMN staff_id   TEXT;
ALTER TABLE appointments ADD COLUMN end_time   TEXT;       -- 'HH:MM' computed from start + duration
ALTER TABLE appointments ADD COLUMN status     TEXT NOT NULL DEFAULT 'booked';

-- helpful indexes
CREATE INDEX IF NOT EXISTS idx_appointments_date_time
  ON appointments(date, time);

CREATE INDEX IF NOT EXISTS idx_appointments_staff
  ON appointments(staff_id, date, time);

-- (optional) backfill end_time for old rows to equal time (0-duration)
UPDATE appointments
SET end_time = time
WHERE end_time IS NULL;

-- sample seed
INSERT OR IGNORE INTO services(id, name, duration_min, price_cents) VALUES
  ('svc-haircut', 'haircut', 30, 3000),
  ('svc-nails',   'nails',   45, 4500);

INSERT OR IGNORE INTO staff(id, name, active) VALUES
  ('stf-amy',   'Amy',   1),
  ('stf-bob',   'Bob',   1),
  ('stf-chris', 'Chris', 0);