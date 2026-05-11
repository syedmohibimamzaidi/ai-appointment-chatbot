import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

// ─────────────────────────────────────────────────────────────────────────────
// The AI is NOT responsible for resolving dates.
// It only extracts the raw human phrase the user said ("tomorrow", "Friday",
// "May 9") into the `dateText` field.  The backend's resolveDateText() converts
// that phrase to a concrete YYYY-MM-DD using the correct Edmonton timezone.
//
// The AI is also NOT responsible for remembering prior fields.
// The backend's mergeBookingFields() owns accumulation.  The AI must only
// emit fields that are EXPLICITLY present in the CURRENT user message.
// It must never copy, infer, or re-emit fields from earlier turns on its own.
// ─────────────────────────────────────────────────────────────────────────────

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MAX_HISTORY_TURNS = 10;

/**
 * Build the system prompt.
 *
 * Known fields are injected so the model knows what's already collected and
 * won't re-ask. The AI's only job is to:
 *   1. Extract NEW fields from the CURRENT user message into the JSON.
 *   2. Ask for exactly one missing field at a time.
 *   3. NEVER set intent:"book" — the server decides when to attempt a booking.
 */
function buildSystemPrompt(pendingBooking) {
  const known = [];
  if (pendingBooking.name) known.push(`name: "${pendingBooking.name}"`);
  if (pendingBooking.service)
    known.push(`service: "${pendingBooking.service}"`);
  if (pendingBooking.dateText) known.push(`date: "${pendingBooking.dateText}"`);
  if (pendingBooking.time) known.push(`time: "${pendingBooking.time}"`);
  if (pendingBooking.phone) known.push(`phone: "${pendingBooking.phone}"`);

  const nothingCollected = known.length === 0;

  const knownSection = nothingCollected
    ? "STATE: Nothing has been collected yet. Greet the user and ask how you can help."
    : `STATE — fields already collected (do NOT ask for these again, do NOT contradict them):\n  ${known.join("\n  ")}`;

  const allRequired = ["name", "service", "dateText", "time"];
  const missingRequired = allRequired.filter((f) =>
    f === "dateText" ? !pendingBooking.dateText : !pendingBooking[f],
  );
  const nextToAsk = nothingCollected ? null : (missingRequired[0] ?? null);

  const fieldQuestion = {
    name: "what name should the booking be under",
    service: "what service they would like (e.g. haircut, manicure, etc.)",
    dateText: "what date they would like (e.g. tomorrow, Friday, May 9)",
    time: "what time they would like (e.g. 2pm, 14:00)",
  };

  const askSection = nothingCollected
    ? "" // greeting only
    : nextToAsk
      ? `NEXT ACTION: Acknowledge what the user just said, then ask ${fieldQuestion[nextToAsk]}. You MUST end your reply text with a question for "${nextToAsk}".`
      : `NEXT ACTION: All required fields are collected. Confirm the full booking details warmly and naturally.`;

  return `You are the booking assistant for Demo Salon. You help users book salon appointments.

${knownSection}
${askSection ? "\n" + askSection : ""}

CRITICAL RULES — read carefully:

A. Your reply has TWO parts:
   1. A short, natural reply to the user (1-2 sentences).
   2. A fenced JSON block in this EXACT schema:
   \`\`\`json
   { "intent": "clarify|cancel|unknown", "name": "", "service": "", "dateText": "", "time": "", "phone": "" }
   \`\`\`

B. JSON field rules:
   - ONLY populate fields the user EXPLICITLY stated in THIS current message.
   - If the user only said their name, set ONLY "name". Leave all other fields as "".
   - If the user only said a time, set ONLY "time". Leave all other fields as "".
   - NEVER copy values from previous turns into the JSON. The server handles memory.
   - NEVER invent or guess any field value.
   - "intent" is ALWAYS "clarify" unless the user explicitly asks to cancel.
     NEVER use "book" — the server decides when to book, not you.
   - "dateText": copy the user's exact words ("tomorrow", "Saturday", "May 9").
     Do NOT resolve to YYYY-MM-DD. The server does that.
   - "time": 24-hour HH:MM format only.

C. Reply text rules:
   - ONLY reference what the user said in THIS message OR what is in the STATE section above.
   - NEVER invent details. If the user said "haircut tomorrow", do NOT say "manicure" or "Saturday".
   - If the STATE shows fields collected, you may reference those values, but do NOT make up new ones.
   - If "NEXT ACTION" tells you to ask for a field, you MUST ask for that field at the end of your reply.

D. Examples of correct behaviour (these are reference only — do NOT treat them as conversation history):
   - User says "Hi" with no state → "Hello! Welcome to Demo Salon. How can I help you today?" + empty JSON.
   - User says "I want a haircut tomorrow" with no prior state → acknowledge, then ask for the user's name (since name is the next missing field). JSON: { service: "haircut", dateText: "tomorrow", everything else "" }.
   - User says just "Alex" when state shows service+date already collected and time is the next missing field → "Thanks, Alex! What time would you like?" JSON: { name: "Alex", everything else "" }.
   - User says something unrelated like "so then what" → DO NOT invent details. Briefly recap the actual STATE and ask for the next missing field.`;
}

// ── Few-shot strategy ──────────────────────────────────────────────────────
// We deliberately do NOT send few-shot examples as bare {role:"user"} /
// {role:"assistant"} messages. The model treats those as real conversation
// history and bleeds details from them into responses (e.g. "you mentioned
// a manicure on Saturday" when the user never said anything of the kind).
//
// Instead, examples are documented INSIDE the system prompt under section D.
// The model understands those as instructions, not as facts about the user.
// ────────────────────────────────────────────────────────────────────────────

/**
 * getChatResponse
 *
 * @param {string} userMessage          - The current user message.
 * @param {Array}  conversationHistory  - Full [{role, content}] history for this session.
 * @param {Object} pendingBooking       - Accumulated booking fields so far.
 *                                        Uses `dateText` (raw phrase), NOT `date` (ISO).
 * @returns {{ reply: string, conversationHistory: Array }}
 */
export async function getChatResponse(
  userMessage,
  conversationHistory = [],
  pendingBooking = {},
) {
  try {
    const updatedHistory = [
      ...conversationHistory,
      { role: "user", content: userMessage },
    ];

    // Keep the most recent N turn-pairs to control token cost.
    const trimmed = updatedHistory.slice(-MAX_HISTORY_TURNS * 2);

    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      max_tokens: 300,
      messages: [
        { role: "system", content: buildSystemPrompt(pendingBooking) },
        ...trimmed,
      ],
    });

    const reply = res.choices[0].message.content.trim();

    const newHistory = [
      ...updatedHistory,
      { role: "assistant", content: reply },
    ];

    return { reply, conversationHistory: newHistory };
  } catch (err) {
    console.error("OpenAI error:", err);
    return {
      reply: "Sorry, I couldn't process your request.",
      conversationHistory,
    };
  }
}
