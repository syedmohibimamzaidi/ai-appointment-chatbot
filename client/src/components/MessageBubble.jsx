import BookingSummaryCard from "./BookingSummaryCard";

export default function MessageBubble({
  sender,
  text,
  createdAt,
  status,
  isError,
  messageType,
  bookingDraft,
  suggestions,
  onChipClick,
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

  const isBookingCard =
    !isUser &&
    (messageType === "booking_summary" ||
      messageType === "booking_confirmed") &&
    bookingDraft;

  const isConfirmed = messageType === "booking_confirmed";

  // Only show chips on bot messages that carry a non-empty suggestions array
  // and only when not rendering a booking card (those don't suggest slots).
  const hasSuggestions =
    !isUser &&
    !isBookingCard &&
    Array.isArray(suggestions) &&
    suggestions.length > 0;

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

        {hasSuggestions && (
          <div className="suggestion-chips">
            {suggestions.map((time) => (
              <button
                key={time}
                type="button"
                className="suggestion-chip"
                onClick={() => onChipClick?.(time)}
              >
                {time}
              </button>
            ))}
          </div>
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
