import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import session from "express-session";
import { getChatResponse } from "./chatbot.js";
import { db, run, all, get, findOrCreateCustomer } from "./db.js";

// env
dotenv.config();
dayjs.extend(utc);
dayjs.extend(timezone);

// constants
const app = express();
const PORT = process.env.PORT || 3000;
const CAPACITY_PER_SLOT = parseInt(process.env.CAPACITY_PER_SLOT || "1", 10);
const SLOT_STEP_MINUTES = parseInt(process.env.SLOT_STEP_MINUTES || "30", 10);
const SERVICE_DURATION_MIN = parseInt(process.env.SERVICE_DURATION_MIN || "30");
const SUGGEST_SLOTS = parseInt(process.env.SUGGEST_SLOTS || "3", 10);
const [OPEN_HHMM, CLOSE_HHMM] = (process.env.HOURS || "09:00-18:00").split("-");
const TZ = "America/Edmonton";
const DEBUG = process.env.NODE_ENV !== "production";

// ─────────────────────────────────────────────────────────────────────────────
// DATE / TIMEZONE — single source of truth
//
// BUSINESS_TZ is the canonical timezone for all date arithmetic.
// It is evaluated fresh on every call (never cached at module load)
// so it correctly handles requests at 11:58 PM, midnight rollovers, etc.
// ─────────────────────────────────────────────────────────────────────────────
const BUSINESS_TZ = process.env.BUSINESS_TZ || TZ; // "America/Edmonton"

/**
 * getBusinessNow()
 * Returns the current moment expressed in the business timezone.
 * Call this fresh inside every request — never cache the result.
 *
 * @returns {{ now: dayjs, isoDate: string, displayDate: string, weekday: string }}
 */
function getBusinessNow() {
  const now = dayjs().tz(BUSINESS_TZ);
  return {
    now, // dayjs object for arithmetic
    isoDate: now.format("YYYY-MM-DD"), // e.g. "2026-05-08"
    displayDate: now.format("dddd, MMMM D, YYYY"), // e.g. "Friday, May 8, 2026"
    weekday: now.format("dddd").toLowerCase(), // e.g. "friday"
  };
}

/**
 * resolveDateText(dateText)
 * Converts a raw human date phrase into a concrete YYYY-MM-DD.
 * The AI outputs the raw phrase; THIS function converts it — the AI never does.
 *
 * Handles:
 *   "today"                     → Edmonton today
 *   "tomorrow"                  → Edmonton today + 1 day
 *   weekday name ("friday")     → next upcoming occurrence of that weekday
 *   "next <weekday>"            → same as plain weekday (next upcoming)
 *   partial date ("May 9")      → resolved against current year/context
 *   ISO date ("2026-05-10")     → passed through unchanged
 *
 * @param {string} dateText  - Raw phrase from AI payload e.g. "tomorrow", "Friday"
 * @returns {{ isoDate: string, displayLabel: string }}
 */
function resolveDateText(dateText) {
  const { now, isoDate: todayISO } = getBusinessNow();

  if (!dateText || !dateText.trim()) {
    return { isoDate: "", displayLabel: "" };
  }

  const raw = dateText.trim();
  const lower = raw.toLowerCase().replace(/^next\s+/, ""); // strip leading "next "

  // ── "today" ────────────────────────────────────────────────────────────────
  if (lower === "today") {
    return {
      isoDate: todayISO,
      displayLabel: now.format("dddd, MMMM D, YYYY"),
    };
  }

  // ── "tomorrow" ─────────────────────────────────────────────────────────────
  if (lower === "tomorrow") {
    const d = now.add(1, "day");
    return {
      isoDate: d.format("YYYY-MM-DD"),
      displayLabel: d.format("dddd, MMMM D, YYYY"),
    };
  }

  // ── Weekday name ("friday", "saturday", …) ─────────────────────────────────
  const WEEKDAYS = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  if (WEEKDAYS.includes(lower)) {
    const target = WEEKDAYS.indexOf(lower);
    const current = now.day(); // 0=Sun … 6=Sat
    let diff = target - current;
    if (diff <= 0) diff += 7; // always the NEXT upcoming occurrence
    const d = now.add(diff, "day");
    return {
      isoDate: d.format("YYYY-MM-DD"),
      displayLabel: d.format("dddd, MMMM D, YYYY"),
    };
  }

  // ── Already a valid ISO date ("2026-05-10") ────────────────────────────────
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = dayjs.tz(raw, BUSINESS_TZ);
    return {
      isoDate: raw,
      displayLabel: d.format("dddd, MMMM D, YYYY"),
    };
  }

  // ── Partial date ("May 9", "May 9th", "9 May") ───────────────────────────
  // Attempt to parse with dayjs using the current year; bump year if already past.
  const MONTHS = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };
  // Match "May 9", "May 9th", "9 May", "9th May"
  const partialRe =
    /^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?$|^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)$/i;
  const pm = raw.replace(/\./g, "").trim().match(partialRe);
  if (pm) {
    const monthWord = (pm[1] || pm[4]).toLowerCase();
    const dayNum = parseInt(pm[2] || pm[3], 10);
    const monthNum = MONTHS[monthWord];
    if (monthNum && dayNum >= 1 && dayNum <= 31) {
      let year = now.year();
      let candidate = dayjs.tz(
        `${year}-${String(monthNum).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`,
        BUSINESS_TZ,
      );
      // If the date has already passed this year, use next year
      if (candidate.isBefore(now, "day")) {
        year += 1;
        candidate = dayjs.tz(
          `${year}-${String(monthNum).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`,
          BUSINESS_TZ,
        );
      }
      return {
        isoDate: candidate.format("YYYY-MM-DD"),
        displayLabel: candidate.format("dddd, MMMM D, YYYY"),
      };
    }
  }

  // ── Fallback: return raw text unmodified so the caller can handle the gap ──
  return { isoDate: raw, displayLabel: raw };
}

// Log server's view of "now" at startup so it's easy to spot TZ misconfiguration.
const _startupNow = getBusinessNow();
console.log(
  `SERVER STARTUP — businessNow: ${_startupNow.isoDate} (${_startupNow.displayDate}) [${BUSINESS_TZ}]`,
);

// ─────────────────────────────────────────────────────────────────────────────
// Conversation state — dual store
//
// Mobile Safari blocks third-party cookies, so the session cookie doesn't
// survive cross-site requests (Vercel frontend → Render backend). We let the
// client send a stable `conversationId` (from localStorage) and key state off
// that when present; otherwise we fall back to express-session as before.
//
// Both stores are in-memory, which matches the existing MemoryStore behavior.
// Swap for Redis/SQLite when scaling.
// ─────────────────────────────────────────────────────────────────────────────
const conversationStore = new Map();

function getState(req) {
  const id = req.body?.conversationId;
  if (id) {
    if (!conversationStore.has(id)) {
      conversationStore.set(id, {
        conversationHistory: [],
        pendingBooking: {},
        awaitingConfirmation: false,
      });
    }
    return { store: "id", state: conversationStore.get(id), id };
  }
  // Fallback: express-session
  if (!req.session.conversationHistory) req.session.conversationHistory = [];
  if (!req.session.pendingBooking) req.session.pendingBooking = {};
  return {
    store: "session",
    state: req.session,
    id: req.sessionID,
  };
}

// middleware
// CORS must allow credentials so the session cookie survives cross-origin
// requests (e.g. Vite dev server on :5173 calling backend on :3000).
// `origin` MUST be explicit (not "*") when credentials are enabled — browsers
// reject wildcard origins on credentialed requests.
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
  }),
);
app.use(express.json());

app.set("trust proxy", 1);
// Session middleware — keeps conversationHistory and pendingBooking per browser tab.
// For production, swap MemoryStore with connect-sqlite3 or connect-redis.
//
// NOTE on cookies in dev:
//   - sameSite: "lax" works when frontend & backend share the same site
//   - For cross-site (different ports/domains), browsers require sameSite:"none"
//     AND secure:true (HTTPS). For local dev over HTTP, "lax" is the right choice
//     and works because Vite proxies or same-localhost requests count as same-site.
app.use(
  session({
    secret: process.env.SESSION_SECRET || "chatbot-dev-secret",
    resave: false,
    saveUninitialized: true,
    cookie: {
      maxAge: 30 * 60 * 1000, // 30 minutes
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production",
    },
  }),
);

// DB helpers
async function slotCount(date, time) {
  const row = await get(
    `SELECT COUNT(*) AS n FROM appointments WHERE date = ? AND time = ?`,
    [date, time],
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
    [b.id, b.customerId, b.name, b.service, b.date, b.time, b.createdAt],
  );
  return b;
}

// Pure utilities
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

function formatDisplayTime(time24) {
  const [hour, minute] = time24.split(":").map(Number);
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function formatDisplayDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function validatePhone(raw) {
  if (!raw) {
    return {
      valid: false,
      normalized: "",
      message:
        "The phone number you provided seems invalid. Please enter a 10-digit phone number.",
    };
  }
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return { valid: true, normalized: digits.slice(1), message: "" };
  }
  if (digits.length === 10) {
    return { valid: true, normalized: digits, message: "" };
  }
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

/**
 * Merge newly extracted fields from the AI payload into the running pendingBooking.
 * Only overwrites a field if the new value is non-empty — so earlier answers are
 * never wiped by a later partial response.
 *
 * NOTE: we merge `dateText` (the raw phrase) — never `date` (ISO string).
 * The AI is not trusted to output a resolved date; resolveDateText() does that.
 */
function mergeBookingFields(pending, payload) {
  const merged = { ...pending };

  // Scalar fields where we trust the AI directly
  for (const field of ["name", "service", "time", "phone"]) {
    const newVal = (payload?.[field] || "").trim();
    if (newVal) merged[field] = newVal;
  }

  // Date: store the RAW phrase from the AI, not a resolved ISO date.
  // The AI may output payload.dateText ("tomorrow", "Friday", "May 9").
  // If (for backwards-compat) it outputs payload.date that looks like a raw phrase
  // rather than an ISO date, accept that too — but reject anything that is already
  // a resolved ISO date (those would have come from an older prompt version).
  const rawDateText = (payload?.dateText || "").trim();
  const legacyDate = (payload?.date || "").trim();

  if (rawDateText) {
    // Preferred: explicit dateText field
    merged.dateText = rawDateText;
  } else if (legacyDate && !/^\d{4}-\d{2}-\d{2}$/.test(legacyDate)) {
    // Fallback: legacy `date` field that is NOT already an ISO string
    // (e.g. the AI sent "tomorrow" in the `date` field from an old prompt)
    merged.dateText = legacyDate;
  }
  // If legacyDate IS an ISO string we silently discard it — the server will
  // re-resolve from dateText on the next complete booking attempt.

  return merged;
}

/**
 * Build the booking object that gets validated and saved.
 * This is the ONLY place dateText is converted to a concrete ISO date.
 */
function toBookingObject(pending) {
  const { isoDate, displayLabel } = resolveDateText(pending.dateText || "");
  return {
    id: crypto.randomUUID(),
    name: (pending.name || "").trim(),
    service: (pending.service || "").trim(),
    dateText: (pending.dateText || "").trim(), // keep for logging
    date: isoDate, // resolved YYYY-MM-DD
    displayDate: displayLabel, // e.g. "Saturday, May 9, 2026"
    time: (pending.time || "").trim(),
    phone: (pending.phone || "").trim(),
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

function getDowFromISO(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.getDay();
}

async function getHoursForDate(dateStr) {
  const dow = getDowFromISO(dateStr);
  return await get("SELECT open, close FROM hours WHERE dow = ?", [dow]);
}

async function getBlackoutForDate(dateStr) {
  return await get("SELECT date, note FROM blackouts WHERE date = ?", [
    dateStr,
  ]);
}

async function findBlackout(dateStr) {
  return await get("SELECT date, note FROM blackouts WHERE date = ?", [
    dateStr,
  ]);
}

export async function isWithinBusinessHours(dateStr, timeStr) {
  const blackout = await getBlackoutForDate(dateStr);
  if (blackout) return false;
  const hours = await getHoursForDate(dateStr);
  if (!hours) return false;
  const { open, close } = hours;
  const openMins = hhmmToMinutes(open);
  const closeMins = hhmmToMinutes(close);
  const start = hhmmToMinutes(timeStr);
  const end = start + SERVICE_DURATION_MIN;
  return start >= openMins && end <= closeMins;
}

async function nextAvailableSlots(
  dateStr,
  startHHMM,
  durationMin,
  limit = SUGGEST_SLOTS,
) {
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
    if (!(await isSlotFull(dateStr, hhmm))) slots.push(hhmm);
    t += SLOT_STEP_MINUTES;
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

    // Response state — populated by the confirmation state machine below.
    let saved = null;
    let conflict = false;
    let suggestions = [];
    let messageType = null;
    let bookingDraft = null;

    // ── Conversation state ─────────────────────────────────────────────────
    // Resolves to either a conversationId-keyed entry (mobile) or req.session
    // (desktop). The rest of the handler reads/writes `state.X` instead of
    // `req.session.X` so the storage choice is transparent.
    const { store, state, id: stateKey } = getState(req);

    // ── Session debug ────────────────────────────────────────────────────────
    // If sessionID changes between requests, the cookie isn't round-tripping
    // and pendingBooking will be empty every turn. Watch this log.
    if (DEBUG) {
      console.log(
        `🔑 STATE[${store}] ${stateKey?.slice(0, 8)}…  ` +
          `pendingFields=[${
            Object.keys(state.pendingBooking || {})
              .filter((k) => state.pendingBooking[k])
              .join(",") || "none"
          }]  ` +
          `awaitingConfirmation=${!!state.awaitingConfirmation}  ` +
          `historyLen=${(state.conversationHistory || []).length}`,
      );
    }

    // ── Pre-detect yes/no so we can short-circuit the AI call when confirming ──
    const trimmedMsg = (message || "").trim().toLowerCase();

    // Match yes/no ONLY when it is the entire message (with optional trailing
    // punctuation like "yes!", "no."). Prevents "ok so actually 3pm" from being
    // treated as confirmation while the user is still editing the draft.
    const YES_RE =
      /^(yes|yeah|yep|yup|sure|ok|okay|confirm|confirmed|book it|sounds good|go ahead|please do|do it|that's right|thats right|correct)[!.?]*$/i;
    const NO_RE = /^(no|nope|nah|cancel|don't|do not|stop|wait|abort)[!.?]*$/i;
    const isYes = YES_RE.test(trimmedMsg);
    const isNo = NO_RE.test(trimmedMsg);
    const shortCircuitAI =
      !!state.session.awaitingConfirmation && (isYes || isNo);

    // ── Call AI (unless we're handling a yes/no confirmation, where the server owns the reply) ──
    let rawReply = "";
    let payload = null;
    if (!shortCircuitAI) {
      const aiResult = await getChatResponse(
        message,
        state.session.conversationHistory,
        state.session.pendingBooking,
      );
      rawReply = aiResult.reply;
      state.session.conversationHistory = aiResult.conversationHistory;

      if (DEBUG) {
        console.log(
          "\n💬 AI Chatbot Reply:\n---------------------\n",
          rawReply,
          "\n---------------------",
        );
      }

      payload = extractJsonBlock(rawReply);
      console.log("AI PAYLOAD:", payload);
    } else {
      // Still log the user's message into history so future AI turns have context
      state.session.conversationHistory = [
        ...state.session.conversationHistory,
        { role: "user", content: message },
      ];
      if (DEBUG) {
        console.log(
          "⚡ Short-circuiting AI call — handling yes/no confirmation",
        );
      }
    }

    // ── Fallback: if the AI reply had no JSON block, recover gracefully ───────
    let reply = rawReply;
    if (!shortCircuitAI && !payload) {
      const pending0 = state.session.pendingBooking;
      const allRequired = ["name", "service", "dateText", "time"];
      const missing = allRequired.find((f) =>
        f === "dateText" ? !pending0.dateText : !pending0[f],
      );
      const fieldLabel = {
        name: "your name",
        service: "the service you'd like",
        dateText: "what date works for you",
        time: "what time you'd like",
      };
      reply = missing
        ? `Sorry, I didn't catch that. Could you tell me ${fieldLabel[missing]}?`
        : rawReply;
      if (DEBUG) {
        console.warn(
          "⚠️  AI reply had no JSON block. Recovered with fallback:",
          reply,
        );
      }
    }

    // ── Merge any new fields into the running pendingBooking ─────────────────
    // Skip merging when the user just said "yes"/"no" — those aren't field values.
    if (
      payload &&
      (payload.intent === "clarify" || payload.intent === "book") &&
      !isYes &&
      !isNo
    ) {
      state.session.pendingBooking = mergeBookingFields(
        state.session.pendingBooking,
        payload,
      );
    }

    const pending = state.session.pendingBooking;
    const awaitingConfirmation = !!state.session.awaitingConfirmation;

    // ── Phone validation (unchanged) ─────────────────────────────────────────
    if (pending.phone) {
      const phoneValidation = validatePhone(pending.phone);
      if (!phoneValidation.valid) {
        state.session.pendingBooking.phone = "";
        return res.json({
          reply: phoneValidation.message,
          parsed: payload,
          saved: null,
          conflict: false,
          suggestions: [],
        });
      }
      state.session.pendingBooking.phone = phoneValidation.normalized;
      pending.phone = phoneValidation.normalized;
    }

    const booking = toBookingObject(pending);
    const complete = isComplete(booking);

    // ── Confirmation state machine ───────────────────────────────────────────
    if (DEBUG) {
      console.log("┌─ CONFIRMATION STATE ────────────────────────────────");
      console.log(
        `│  bookingDraft:          ${JSON.stringify({ name: booking.name, service: booking.service, date: booking.date, time: booking.time })}`,
      );
      console.log(`│  awaitingConfirmation:  ${awaitingConfirmation}`);
      console.log(`│  userSaidYes:           ${isYes}`);
      console.log(`│  userSaidNo:            ${isNo}`);
      console.log(`│  draftIsComplete:       ${complete}`);
      console.log("└─────────────────────────────────────────────────────");
    }

    // CASE A: User explicitly declined a pending confirmation → clear draft
    if (awaitingConfirmation && isNo) {
      state.session.pendingBooking = {};
      state.session.awaitingConfirmation = false;
      reply =
        "No problem — I've cancelled that booking. Let me know if you'd like to start over.";

      // CASE B: User confirmed a pending complete draft → run availability checks + save
    } else if (awaitingConfirmation && isYes && complete) {
      if (DEBUG) {
        // Date resolution diagnostic
        const { isoDate: serverNowISO, displayDate: serverNowDisplay } =
          getBusinessNow();
        console.log("┌─ DATE RESOLUTION ───────────────────────────────────");
        console.log(
          `│  serverNow:          ${serverNowISO}  (${serverNowDisplay})`,
        );
        console.log(`│  businessNow TZ:     ${BUSINESS_TZ}`);
        console.log(`│  dateText (raw):     "${booking.dateText}"`);
        console.log(`│  resolvedDate:       ${booking.date}`);
        console.log(`│  resolvedDisplay:    ${booking.displayDate}`);
        console.log("└─────────────────────────────────────────────────────");
      }

      const blackout = await findBlackout(booking.date);

      if (blackout) {
        conflict = true;
        state.session.awaitingConfirmation = false; // user must pick a new date
        reply =
          `❌ We're closed on ${booking.displayDate} due to: ${blackout.note || "a blackout day"}.\n` +
          `Please choose another date and I'll re-confirm.`;
      } else {
        const hours = await getHoursForDate(booking.date);

        if (!hours) {
          conflict = true;
          state.session.awaitingConfirmation = false;
          const dow = [
            "Sunday",
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
          ][new Date(booking.date + "T00:00:00").getDay()];
          reply = `❌ We're closed on ${dow}s. Please choose a different day.`;
        } else {
          const withinHours = await isWithinBusinessHours(
            booking.date,
            booking.time,
          );

          if (!withinHours) {
            conflict = true;
            state.session.awaitingConfirmation = false;
            suggestions = await nextAvailableSlots(
              booking.date,
              booking.time,
              SERVICE_DURATION_MIN,
              SUGGEST_SLOTS,
            );
            const list = suggestions.length
              ? suggestions.map((t) => `• ${formatDisplayTime(t)}`).join("\n")
              : "";
            reply =
              `❌ We're closed at ${formatDisplayTime(booking.time)} on ${booking.displayDate}.\n` +
              `Our hours that day are ${formatDisplayTime(hours.open)}–${formatDisplayTime(hours.close)}.\n` +
              (list
                ? `💡 Here are some available times:\n${list}`
                : `Please pick another date.`);
          } else {
            conflict = await isSlotFull(booking.date, booking.time);

            if (!conflict) {
              // ✅ Save the booking
              const customerId = await findOrCreateCustomer(
                booking.name,
                booking.phone,
              );
              booking.customerId = customerId;
              saved = await insertBooking(booking);

              console.log(
                `✅ savedBookingId: ${saved.id}  confirmedIntent: yes`,
              );

              // Reset session — prevents duplicate saves if user repeats "yes"
              state.session.pendingBooking = {};
              state.session.awaitingConfirmation = false;

              const prettyTime = formatDisplayTime(booking.time);
              reply = `✅ Appointment confirmed!\n\nYour ${booking.service} for ${booking.name} has been booked for ${booking.displayDate} at ${prettyTime}.`;

              // Structured payload for the confirmed-state booking card.
              // Reuses the same shape as `booking_summary` so the frontend can render
              // a single card component with a "confirmed" variant.
              messageType = "booking_confirmed";
              bookingDraft = {
                service: booking.service,
                date: booking.displayDate,
                time: prettyTime,
                name: booking.name,
              };
            } else {
              conflict = true;
              state.session.awaitingConfirmation = false;
              suggestions = await nextAvailableSlots(
                booking.date,
                booking.time,
                SERVICE_DURATION_MIN,
                SUGGEST_SLOTS,
              );
              const list = suggestions.length
                ? suggestions.map((t) => `• ${formatDisplayTime(t)}`).join("\n")
                : "";
              reply =
                `❌ That time is fully booked on ${booking.displayDate}.\n` +
                (list
                  ? `Here are the nearest available times:\n${list}`
                  : `Please pick another date.`);
            }
          }
        }
      }

      // CASE C: All fields collected (whether newly so, or user edited the draft) → ask for confirmation
    } else if (complete) {
      // User may have edited a previously-confirmed draft (e.g. "actually 3pm"),
      // in which case awaitingConfirmation is already true — just re-summarize.
      state.session.awaitingConfirmation = true;
      const prettyTime = formatDisplayTime(booking.time);
      reply = `Just to confirm — should I book your ${booking.service} for ${booking.displayDate} at ${prettyTime} under ${booking.name}? Please reply "yes" to confirm or "no" to cancel.`;

      // Structured payload for the frontend booking summary card.
      // The `reply` text above is preserved as a natural-language fallback.
      messageType = "booking_summary";
      bookingDraft = {
        service: booking.service,
        date: booking.displayDate,
        time: prettyTime,
        name: booking.name,
      };
      // CASE D: User said "yes" but draft isn't complete → ignore the yes, keep collecting
    } else if (isYes) {
      // Fall through to the AI's rawReply which is asking for the next missing field
      // (do nothing here)
      // CASE E: Still collecting fields → use the AI's natural reply (already in `reply`)
    } else {
      // do nothing — `reply` already holds the AI's question for the next field
    }

    // If we short-circuited the AI, the assistant reply wasn't logged by
    // chatbot.js — append it here so future AI turns see the full context.
    if (shortCircuitAI) {
      state.session.conversationHistory = [
        ...state.session.conversationHistory,
        { role: "assistant", content: reply },
      ];
    }

    res.json({
      reply,
      parsed: payload || null,
      saved,
      conflict,
      suggestions: suggestions.map(formatDisplayTime),
      awaitingConfirmation: !!state.session.awaitingConfirmation,
      messageType,
      bookingDraft,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// List appointments
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
    [date, time],
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
  const { isoDate, displayDate } = getBusinessNow();
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🕓 Business now: ${isoDate} (${displayDate}) [${BUSINESS_TZ}]`);
});
