🧠 AI Appointment Chatbot
Intelligent salon appointment booking with natural language understanding, Node.js backend, SQLite, and a polished modern UI.


📌 Overview

AI Appointment Chatbot is a full-stack appointment booking system that lets users schedule salon services through a natural conversational interface.
It uses OpenAI GPT-based language parsing, a Node.js + Express backend, SQLite database, and a fully custom-designed React UI with a modern glowing aesthetic.

This project showcases:

Real-time conversational flows

Advanced date/time/service extraction

Slot availability & business-hours logic

Phone number validation & normalization

Conflict resolution with suggested time slots

Polished production-quality front-end

Clean backend architecture & database modeling

It is designed as a portfolio-ready system demonstrating full-stack engineering, UX design, and AI-assisted workflows.

✨ Features
🧠 Natural Language Booking

Users can type messages like:

“Book a haircut for Sagar tomorrow at 4pm.”
“Can I come earlier? Maybe 1:15?”

The AI automatically extracts:

Customer name

Service (haircut, manicure, waxing, etc.)

Date (supports “tomorrow”, “this Friday”, exact dates)

Time

Phone number

Intent (book / modify / clarify)

🗂 Robust Backend Scheduling Logic

Includes:

Business hours enforcement

Blackout days (holidays, closed days)

Time-slot capacity checks

Automatic conflict suggestions

Automatic customer matching or creation

📱 Phone Number Validation & Normalization

Accepts multiple formats (+1 825 888 5611, 825-888-5611, 8258885611, etc.)

Strips non-digits

Ensures a valid 10-digit number

Gives helpful error messages

🎨 High-Quality UI/UX

The frontend includes:

Beautiful glowing gradient user bubbles

Semi-glassmorphic bot bubbles

Clean timestamp design

Smooth animations

Typing indicator

Online status indicator

Center-aligned send button

Fully responsive

(Your UI is extremely polished — this section highlights that professionally.)

🛠️ Tech Stack

Frontend

React

Vite

Custom CSS (no UI libraries)

Animated message bubbles

Custom chat window design

Backend

Node.js

Express

OpenAI GPT API

SQLite3

Knex-style custom database helpers (insert, find, validate)

Database

SQLite with the following tables:

customers

bookings

services

business_hours

blackout_days

📸 Screenshots

To be added later...

Example layout:

/screenshots
   ui-main.png
   ui-bot-reply.png
   ui-conflict.png
   ui-suggestion.png

🚀 Getting Started
1. Clone the repository
git clone https://github.com/syedmohibimamzaidi/ai-appointment-chatbot.git
cd ai-appointment-chatbot

2. Install dependencies
npm install

3. Add your API key

Create a .env file:

OPENAI_API_KEY=your_key_here

4. Initialize the database
node seed.js

5. Run the backend
node server.js

6. Run the frontend
cd client
npm install
npm run dev

🧩 Architecture
Frontend → Backend → AI → Backend → SQLite → Frontend

User sends a chat message

Frontend sends the text to /chatbot

Backend sends a structured prompt to GPT

GPT responds with:

A reply to show to the user

A JSON block describing intent, name, date, time, phone

Backend validates & processes the JSON

Backend inserts or updates a booking

Backend returns the result with:

reply

parsed

saved

conflict

suggestions

This creates a real AI-driven booking engine instead of a simple chatbot.

📬 Future Enhancements

Here are improvements planned (or possible):

✉ Email booking confirmation (SendGrid)

Send a confirmation email to the user after successful booking.

📱 SMS notifications (Twilio / Nexmo)

Optional upgrade for real salons (costs money).

🖥 Admin Dashboard

View bookings

Add blackout days

Add services & durations

View time-slot heatmaps

📅 Calendar Export

Generate .ics files for Google Calendar / Outlook.

🧠 Smarter AI

Detect rescheduling

Support cancellations

Multi-step clarifications

🧑‍💻 Author

Mohib Zaidi
AI & Full-Stack Developer
🇨🇦 University of Alberta
