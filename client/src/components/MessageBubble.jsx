import BookingSummaryCard from "./BookingSummaryCard";

export default function MessageBubble({
  sender,
  text,
  createdAt,
  status,
  isError,
  messageType,
  bookingDraft,
}) {
  const isUser = sender === "user";

  let timeLabel = "";
  if (createdAt) {
    const d = new Date(createdAt);
    timeLabel = d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function stripJson(text) {
    return text.replace(/```json[\s\S]*?```/g, "").trim();
  }

  // A booking card can be in one of two visual states:
  //   - "booking_summary"   → blue, asking for confirmation
  //   - "booking_confirmed" → green, after the user said yes
  // Both share the same structure and component.
  const isBookingCard =
    !isUser &&
    (messageType === "booking_summary" ||
      messageType === "booking_confirmed") &&
    bookingDraft;

  const isConfirmed = messageType === "booking_confirmed";

  return (
    <div
      className={`message-row ${
        isUser ? "message-row--user" : "message-row--bot"
      }`}
    >
      <div
        className={`bubble ${
          isUser ? "user-bubble" : "bot-bubble"
        } ${isError ? "bubble-error" : ""} ${
          isBookingCard ? "bubble-booking" : ""
        } ${isConfirmed ? "bubble-booking--confirmed" : ""}`}
      >
        {isBookingCard ? (
          <BookingSummaryCard draft={bookingDraft} confirmed={isConfirmed} />
        ) : (
          <p>{stripJson(text)}</p>
        )}

        <div className="bubble-meta">
          {timeLabel && <span className="bubble-time">{timeLabel}</span>}
          {isUser && (
            <span className="bubble-status" title={status || "Sent"}>
              ✓
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
