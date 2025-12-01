import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import { getChatResponse } from "./chatbot.js";
import { db, run, all, get, findOrCreateCustomer } from "./db.js";

// env
dotenv.config();

// constants
const app = express();
const PORT = process.env.PORT || 3000;
const CAPACITY_PER_SLOT = parseInt(process.env.CAPACITY_PER_SLOT || "1", 10);
const SLOT_STEP_MINUTES = parseInt(process.env.SLOT_STEP_MINUTES || "30", 10);
const SERVICE_DURATION_MIN = parseInt(process.env.SERVICE_DURATION_MIN || "30");
const SUGGEST_SLOTS = parseInt(process.env.SUGGEST_SLOTS || "3", 10);
const [OPEN_HHMM, CLOSE_HHMM] = (process.env.HOURS || "09:00-18:00").split("-");
const TODAY_ISO = new Date().toISOString().slice(0, 10);
const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

// middleware
app.use(cors());
app.use(express.json());

// DB helpers
async function slotCount(date, time) {
  const row = await get(
    `SELECT COUNT(*) AS n FROM appointments WHERE date = ? AND time = ?`,
    [date, time]
  );
  return row.n;
}

async function isSlotFull(date, time) {
  return (await slotCount(date, time)) >= CAPACITY_PER_SLOT;
}

async function insertBooking(b) {
  await run(
    `INSERT INTO appointments (id, customer_id, name, service, date, time, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [b.id, b.customerId, b.name, b.service, b.date, b.time, b.createdAt]
  );
  return b;
}

// Pure utilities (no DB)
function hhmmToMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function minutesToHHMM(mins) {
  const h = Math.floor(mins / 60)
    .toString()
    .padStart(2, "0");
  const m = (mins % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

// --- phone validation helper ---
function validatePhone(raw) {
  if (!raw) {
    return {
      valid: false,
      normalized: "",
      message:
        "The phone number you provided seems invalid. Please enter a 10-digit phone number.",
    };
  }

  // Keep only digits
  const digits = String(raw).replace(/\D/g, "");

  // If it looks like +1XXXXXXXXXX or 1XXXXXXXXXX (11 digits, leading 1)
  if (digits.length === 11 && digits.startsWith("1")) {
    return {
      valid: true,
      normalized: digits.slice(1), // drop the leading country code
      message: "",
    };
  }

  // Plain North American style: exactly 10 digits
  if (digits.length === 10) {
    return {
      valid: true,
      normalized: digits,
      message: "",
    };
  }

  // Anything else is invalid
  return {
    valid: false,
    normalized: "",
    message:
      "The phone number you provided seems invalid. Please enter a 10-digit number (with or without +1).",
  };
}

function extractJsonBlock(reply) {
  const m = reply.match(/```json\s*([\s\S]*?)\s*```/i);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

function toBookingObject(payload) {
  return {
    id: crypto.randomUUID(),
    name: (payload?.name || "").trim(),
    service: (payload?.service || "").trim(),
    date: (payload?.date || "").trim(),
    time: (payload?.time || "").trim(),
    phone: (payload?.phone || "").trim(),
    createdAt: new Date().toISOString(),
  };
}

function isComplete(b) {
  return (
    b.name &&
    b.service &&
    /^\d{4}-\d{2}-\d{2}$/.test(b.date) &&
    /^\d{2}:\d{2}$/.test(b.time)
  );
}

// --- helper for dates / times ---

function getDowFromISO(dateStr) {
  // dateStr: 'YYYY-MM-DD'
  // JS getDay(): 0=Sun, 1=Mon, ..., 6=Sat
  const d = new Date(dateStr + "T00:00:00");
  return d.getDay();
}

// --- DB helpers for hours + blackouts ---

async function getHoursForDate(dateStr) {
  const dow = getDowFromISO(dateStr); // 0=Sun, 1=Mon, ...
  return await get("SELECT open, close FROM hours WHERE dow = ?", [dow]);
}

// blackout is keyed by real calendar date
async function getBlackoutForDate(dateStr) {
  return await get("SELECT date, note FROM blackouts WHERE date = ?", [
    dateStr,
  ]);
}

// keep this if you use it elsewhere for messaging
async function findBlackout(dateStr) {
  return await get("SELECT date, note FROM blackouts WHERE date = ?", [
    dateStr,
  ]);
}

// --- main business-hours guard ---

export async function isWithinBusinessHours(dateStr, timeStr) {
  // 1) Hard-closed if it’s a blackout date
  const blackout = await getBlackoutForDate(dateStr);
  if (blackout) return false;

  // 2) Get dynamic hours for that weekday
  const hours = await getHoursForDate(dateStr);
  if (!hours) return false; // no hours configured for that day

  const { open, close } = hours;

  const openMins = hhmmToMinutes(open);
  const closeMins = hhmmToMinutes(close);

  const start = hhmmToMinutes(timeStr);
  const end = start + SERVICE_DURATION_MIN; // from env

  // must be fully inside open/close
  return start >= openMins && end <= closeMins;
}

async function nextAvailableSlots(
  dateStr,
  startHHMM,
  durationMin,
  limit = SUGGEST_SLOTS
) {
  // skip whole day if blackout
  if (await getBlackoutForDate(dateStr)) return [];

  const hours = await getHoursForDate(dateStr);
  if (!hours) return [];

  const { open, close } = hours;

  const openMins = hhmmToMinutes(open);
  const closeMins = hhmmToMinutes(close);

  let t = Math.max(hhmmToMinutes(startHHMM), openMins);
  const slots = [];

  while (t + durationMin <= closeMins && slots.length < limit) {
    const hhmm = minutesToHHMM(t);

    const full = await isSlotFull(dateStr, hhmm);
    if (!full) {
      slots.push(hhmm);
    }

    t += SLOT_STEP_MINUTES; // e.g. 15 minutes
  }

  return slots;
}

// Routes
app.get("/", (req, res) => {
  res.send("AI Chatbot is running...");
});

app.post("/chatbot", async (req, res) => {
  try {
    const { message } = req.body;
    let reply = await getChatResponse(message);
    console.log(
      "\n💬 AI Chatbot Reply:\n---------------------\n",
      reply,
      "\n---------------------"
    );

    const payload = extractJsonBlock(reply);
    let saved = null;
    let conflict = false;
    let suggestions = [];

    // booking is visible for the whole handler now
    let booking = null;

    if (payload?.intent === "book") {
      const booking = toBookingObject(payload);

      if (booking.phone) {
        const phoneValidation = validatePhone(booking.phone);
        console.log("phone validation:", booking.phone, phoneValidation);

        if (!phoneValidation.valid) {
          return res.json({
            reply: phoneValidation.message,
            parsed: payload,
            saved: null,
            conflict: false,
            suggestions: [],
          });
        }

        // Store normalized digits
        booking.phone = phoneValidation.normalized;
      }

      if (isComplete(booking)) {
        // 1) Check hours and blackout separately
        const withinHours = await isWithinBusinessHours(
          booking.date,
          booking.time
        );
        const blackout = await findBlackout(booking.date);

        // We'll fill these if we need suggestions
        let open = "??:??";
        let close = "??:??";

        // 2) If blackout -> hard closed for the whole day
        if (blackout) {
          conflict = true;
          suggestions = []; // nextAvailableSlots returns [] for blackout anyway

          reply =
            `❌ We're closed on ${booking.date} due to: ${
              blackout.note || "a blackout day"
            }.\n` +
            `There are no available times that day. Please choose another date.`;
        }

        // 3) Not blackout, but outside business hours
        else if (!withinHours) {
          conflict = true;

          // Suggest alternatives on same day
          suggestions = await nextAvailableSlots(
            booking.date,
            booking.time,
            SERVICE_DURATION_MIN,
            SUGGEST_SLOTS
          );

          const hours = await getHoursForDate(booking.date);
          if (hours) ({ open, close } = hours);

          const list = suggestions.length
            ? suggestions.map((t) => `• ${t}`).join("\n")
            : "";

          reply =
            `❌ We’re closed at ${booking.time} on ${booking.date}.\n` +
            `Our hours that day are ${open}–${close}.\n` +
            (list
              ? `💡 Here are some available times:\n${list}`
              : `There are no open times left that day. Please pick another date.`);
        }

        // 4) Within hours and not a blackout -> check capacity
        else {
          conflict = await isSlotFull(booking.date, booking.time);

          if (!conflict) {
            // Link customer
            const customerId = await findOrCreateCustomer(
              booking.name,
              booking.phone
            );
            booking.customerId = customerId;
            // Happy path booking
            saved = await insertBooking(booking);
            reply = `✅ I've booked a ${booking.service} for ${booking.name} on ${booking.date} at ${booking.time}.`;
          } else {
            // Slot full -> suggest alternatives (no need to mention hours here)
            suggestions = await nextAvailableSlots(
              booking.date,
              booking.time,
              SERVICE_DURATION_MIN,
              SUGGEST_SLOTS
            );

            const list = suggestions.length
              ? suggestions.map((t) => `• ${t}`).join("\n")
              : "";

            reply =
              `❌ That time is fully booked on ${booking.date}.\n` +
              (list
                ? `Here are the nearest available times:\n${list}`
                : `There are no available times remaining that day. Please choose another date.`);
          }
        }
      }
    }
    // Handle phone-only clarify
    if (payload?.intent === "clarify") {
      const phoneOnly =
        payload.phone &&
        payload.phone.trim() !== "" &&
        !payload.name &&
        !payload.service &&
        !payload.date &&
        !payload.time;

      if (phoneOnly) {
        const phoneValidation = validatePhone(payload.phone);
        console.log("phone-only validation:", payload.phone, phoneValidation);

        if (!phoneValidation.valid) {
          return res.json({
            reply: phoneValidation.message,
            parsed: payload,
            saved: null,
            conflict: false,
            suggestions: [],
          });
        }

        const normalized = phoneValidation.normalized;

        // Find the most recent customer without a phone number
        const latestCustomer = await get(
          `SELECT id FROM customers
           WHERE phone IS NULL OR phone = ''
           ORDER BY created_at DESC
           LIMIT 1`
        );

        if (latestCustomer && latestCustomer.id) {
          await run(
            `UPDATE customers
             SET phone = ?
             WHERE id = ?`,
            [normalized, latestCustomer.id]
          );

          reply =
            "Thanks, I've added your phone number to your latest appointment.";
        } else {
          // No customer to attach to – keep it polite and harmless
          reply =
            "Thanks for your phone number. I'll use it for your next appointment booking.";
        }
      }
    }
    // Send response
    res.json({ reply, parsed: payload || null, saved, conflict, suggestions });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// List appointments (optional ?date=YYYY-MM-DD&name=foo)
app.get("/appointments", async (req, res) => {
  const { date, name } = req.query;
  let sql = `SELECT * FROM appointments`;
  const where = [],
    params = [];
  if (date) {
    where.push(`date = ?`);
    params.push(date);
  }
  if (name) {
    where.push(`LOWER(name) LIKE ?`);
    params.push(`%${name.toLowerCase()}%`);
  }
  if (where.length) sql += ` WHERE ` + where.join(" AND ");
  sql += ` ORDER BY date, time`;
  res.json(await all(sql, params));
});

// Availability check
app.get("/availability", async (req, res) => {
  const { date, time } = req.query;
  if (!date || !time)
    return res.status(400).json({ error: "date and time required" });
  const taken = await get(
    `SELECT 1 FROM appointments WHERE date = ? AND time = ?`,
    [date, time]
  );
  res.json({ available: !taken });
});

// Cancel by id
app.delete("/appointments/:id", async (req, res) => {
  const r = await run(`DELETE FROM appointments WHERE id = ?`, [req.params.id]);
  if (!r.changes) return res.status(404).json({ error: "not found" });
  res.json({ ok: true, deleted: req.params.id });
});

// Server start
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🕓 Today is ${TODAY_ISO} (${LOCAL_TZ})`);
});
