# AI Appointment Chatbot

AI Appointment Chatbot is a full-stack conversational booking system that allows users to schedule salon services using natural language. The application combines a React frontend, a Node.js/Express backend, a SQLite database, and OpenAI APIs to interpret user requests and manage appointment scheduling.

The system demonstrates how conversational AI can be integrated with real backend business logic to automate service booking workflows.

---

## Overview

The AI Appointment Chatbot allows users to book appointments through a conversational interface rather than traditional forms. Users can describe their request naturally, and the system extracts structured booking information such as the service requested, date, time, and customer details.

The backend validates requests against scheduling rules such as business hours, blackout days, and time-slot capacity before confirming the booking.

Key capabilities include:

- Natural language appointment booking
- Automatic extraction of booking details (name, service, date, time)
- Business hours validation
- Blackout day handling
- Time-slot conflict detection
- Alternative time suggestions when conflicts occur
- Phone number validation and normalization
- Persistent booking storage with SQLite

---

## Project Goals

This project was built to demonstrate:

- Full-stack application development
- Conversational AI integration using the OpenAI API
- Backend scheduling systems and conflict resolution
- Database design and validation logic
- Modern frontend UI design

---

## Features

### Natural Language Booking

Users can send requests such as:

> "Book a haircut for Mohib tomorrow at 2pm."

The system extracts structured information including:

- Customer name
- Service requested
- Date
- Time
- Phone number (if provided)
- User intent (book, clarify, modify)

The backend then validates the request and confirms the appointment or suggests alternatives if conflicts occur.

---

### Backend Scheduling Logic

The backend implements several layers of validation to ensure bookings follow real-world constraints:

- Business hours enforcement
- Blackout date handling (holidays or closed days)
- Slot capacity limits
- Automatic alternative slot suggestions
- Automatic customer record creation or lookup

This allows the chatbot to behave like a real scheduling engine rather than a simple conversational interface.

---

### Phone Number Validation

Phone numbers provided by users are validated and normalized before being stored.

The system:

- Accepts multiple formats
- Removes non-digit characters
- Validates a 10-digit North American number
- Returns helpful error messages for invalid input

---

### User Interface

The frontend is built using React and designed as a modern chat interface.

UI features include:

- Message bubbles for user and assistant responses
- Timestamped messages
- Typing indicator
- Online status indicator
- Smooth animations and transitions
- Responsive layout

The design focuses on clarity and usability while maintaining a polished visual style.

---

## Technology Stack

### Frontend

- React
- Vite
- Custom CSS

### Backend

- Node.js
- Express
- OpenAI API

### Database

- SQLite

---

## Database Schema

The SQLite database stores customer and appointment information.

Main tables include:

- `customers` – customer information and phone numbers
- `appointments` – scheduled bookings
- `hours` – configured business hours
- `blackouts` – closed dates and holidays

---

## Getting Started

### Clone the repository

```bash
git clone https://github.com/syedmohibimamzaidi/ai-appointment-chatbot.git
cd ai-appointment-chatbot
```

### Install dependencies

```bash
npm install
```

### Configure environment variables

Create a `.env` file in the project root:

```env
OPENAI_API_KEY=your_api_key_here
```

### Initialize the database

```bash
node seed.js
```

### Start the backend server

```bash
node server.js
```

### Run the frontend

```bash
cd client
npm install
npm run dev
```

---

## System Architecture

The request flow follows this sequence:

```text
Frontend → Backend → OpenAI API → Backend → SQLite → Frontend
```

1. The user sends a message through the chat interface.
2. The frontend sends the message to the `/chatbot` API endpoint.
3. The backend forwards the prompt to the OpenAI API for structured intent extraction.
4. The backend validates the extracted booking data.
5. If valid, the booking is stored in the SQLite database.
6. The result is returned to the frontend as a chat response.

The backend response includes:

- `reply` – message shown to the user
- `parsed` – extracted structured booking data
- `saved` – booking record (if created)
- `conflict` – whether a scheduling conflict occurred
- `suggestions` – alternative available time slots

---

## Production Extensions

The system architecture allows several integrations for real-world deployment:

- **Email confirmations (SendGrid / AWS SES)**  
  Send automatic confirmation emails after bookings are created.

- **SMS notifications (Twilio)**  
  Send SMS confirmations and appointment reminders to customers.

- **Admin dashboard**  
  Interface for managing bookings, services, and blackout dates.

- **Calendar export**  
  Generate `.ics` files compatible with Google Calendar or Outlook.

- **Rescheduling and cancellation through chat**  
  Extend the conversational interface to support booking modifications.

---

## Author

**Mohib Zaidi**  
Software Engineering Co-op Student  
University of Alberta
