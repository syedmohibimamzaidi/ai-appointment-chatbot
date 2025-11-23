import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import { getChatResponse } from "./chatbot.js";
import { db, run, all, get } from "./db.js";

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
    `INSERT INTO appointments (id, name, service, date, time, createdAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [b.id, b.name, b.service, b.date, b.time, b.createdAt]
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

// --- business hours + blackout helpers ---

function getDowFromISO(dateStr) {
  const d = new Date(dateStr); // 'YYYY-MM-DD'
  return d.getDay(); // 0=Sun..6=Sat
}

async function getHoursForDate(dateStr) {
  const dow = getDowFromISO(dateStr);

  // hours table has column 'dow', not 'date'
  return await get("SELECT open, close FROM hours WHERE dow = ?", [dow]);
}

// blackout *does* use a real 'date' column
async function getBlackoutForDate(dateStr) {
  return await get("SELECT date, note FROM blackouts WHERE date = ?", [
    dateStr,
  ]);
}

// alias used elsewhere
async function findBlackout(dateStr) {
  return getBlackoutForDate(dateStr);
}

export async function isWithinBusinessHours(dateStr, timeStr) {
  const hours = await getHoursForDate(dateStr);

  // If no hours configured for that day, treat as always open
  if (!hours) return true;

  const { open, close } = hours;
  return timeStr >= open && timeStr <= close;
}

// Suggest up to `limit` free slots on a given date, starting from a requested time
async function nextAvailableSlots(dateStr, startHHMM, durationMin, limit = 3) {
  // If date is fully blacked out, no suggestions
  if (await findBlackout(dateStr)) {
    return [];
  }

  // Get working hours for that date
  const hours = await getHoursForDate(dateStr);
  if (!hours) {
    return [];
  }

  const { open, close } = hours;

  const openMins = hhmmToMinutes(open);
  const closeMins = hhmmToMinutes(close);

  // Start from either requested time or opening time
  let t = Math.max(hhmmToMinutes(startHHMM), openMins);

  const suggestions = [];

  while (t + durationMin <= closeMins && suggestions.length < limit) {
    const hhmm = minutesToHHMM(t);

    // blackout already checked for that whole date
    const full = await isSlotFull(dateStr, hhmm);

    if (!full) {
      suggestions.push(hhmm);
    }

    t += SLOT_STEP_MINUTES;
  }

  return suggestions;
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

    if (payload?.intent === "book") {
      const booking = toBookingObject(payload);

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
