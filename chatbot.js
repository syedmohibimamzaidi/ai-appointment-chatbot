import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

// Dynamically get today's date and your local timezone
const TODAY_ISO = new Date().toISOString().slice(0, 10);
const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

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
            '- "phone" is the customer phone number as a string, or "" if the user hasn’t provided it yet.',
            "- Never say you can’t book appointments — you CAN record them.",
          ].join(" "),
        },

        // Few-shot example 1
        {
          role: "user",
          content: "Book a haircut tomorrow at 3 PM for Mohib",
        },
        {
          role: "assistant",
          content:
            'Booked a haircut for Mohib tomorrow at 15:00. If that’s right, I’ll confirm it.\n\n```json\n{ "intent": "book", "name": "Mohib", "service": "haircut", "date": "YYYY-MM-DD", "time": "15:00" }\n```',
        },

        // Few-shot example 2
        {
          role: "user",
          content: "Can I get nails done on Friday?",
        },
        {
          role: "assistant",
          content:
            'Sure — what time would you like on Friday?\n\n```json\n{ "intent": "clarify", "name": "", "service": "nails", "date": "YYYY-MM-DD", "time": "" }\n```',
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
