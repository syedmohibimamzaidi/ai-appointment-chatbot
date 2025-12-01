import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

// Dynamically get today's date and your local timezone
// Get system timezone
const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

// Convert today's date to local YYYY-MM-DD
const formatLocalDate = () => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: LOCAL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(now);
  const year = parts.find((p) => p.type === "year").value;
  const month = parts.find((p) => p.type === "month").value;
  const day = parts.find((p) => p.type === "day").value;

  return `${year}-${month}-${day}`;
};

const TODAY_ISO = formatLocalDate();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function getChatResponse(prompt) {
  try {
    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: [
            `Today’s date is ${TODAY_ISO} and the timezone is ${LOCAL_TZ}.`,
            "You are the booking assistant for Demo Salon. You CAN book appointments.",
            "Your job is to extract name, service, date, and time from messages.",
            "If something is missing, ask ONE clear follow-up question.",
            "Always respond in TWO parts:",
            "1) A short, friendly human message confirming or asking a question.",
            "2) A fenced JSON block following this schema exactly:",
            "```json",
            ' { "intent": "book|clarify|cancel|unknown",',
            '   "name": "",',
            '   "service": "",',
            '   "date": "YYYY-MM-DD",',
            '   "time": "HH:MM",',
            '   "phone": ""',
            " }",
            "```",
            "Rules:",
            "- Use 24-hour time (HH:MM)",
            "- Use ISO date (YYYY-MM-DD)",
            "- If user says 'tomorrow', resolve it using today's date above.",
            "- If the user only adds NEW information (for example, just a phone number), ONLY fill that field in the JSON and leave other fields as empty strings.",
            "- Never invent a service, date, or time just to fill the JSON. If you aren't sure, leave it as an empty string.",
            "- Do not copy example values like 'nails' or a day of week unless the user actually said them.",
            "- Do NOT say that the user has already provided a detail (like their phone number) unless the current message explicitly says something like 'again' or 'same as before'. Just thank them and confirm what you received.",
            '- "phone" is the customer phone number as a string, or "" if the user hasn’t provided it yet.',
            "- Never say you can’t book appointments — you CAN record them.",
          ].join(" "),
        },

        // Few-shot example 1: full booking
        {
          role: "user",
          content: "Book a haircut tomorrow at 3 PM for Mohib",
        },
        {
          role: "assistant",
          content:
            'Booked a haircut for Mohib tomorrow at 15:00. If that’s right, I’ll confirm it.\n\n```json\n{ "intent": "book", "name": "Mohib", "service": "haircut", "date": "YYYY-MM-DD", "time": "15:00" }\n```',
        },

        // Few-shot example 2: missing time
        {
          role: "user",
          content: "Can I get a haircut on Friday?",
        },
        {
          role: "assistant",
          content:
            'Sure — what time would you like on Friday?\n\n```json\n{ "intent": "clarify", "name": "", "service": "haircut", "date": "YYYY-MM-DD", "time": "", "phone": "" }\n```',
        },

        // Few-shot example 3: phone-only message
        {
          role: "user",
          content: "Here's my phone number: +1 825 888 5611",
        },
        {
          role: "assistant",
          content:
            'Thanks for providing your phone number. I\'ll add it to your appointment.\n\n```json\n{ "intent": "clarify", "name": "", "service": "", "date": "", "time": "", "phone": "+1 825 888 5611" }\n```',
        },
        { role: "user", content: prompt },
      ],
    });
    return res.choices[0].message.content.trim();
  } catch (err) {
    console.error("OpenAI error:", err);
    return "Sorry, I couldn’t process your request.";
  }
}
