export default function MessageBubble({
  sender,
  text,
  createdAt,
  status,
  isError,
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

  return (
    <div
      className={`message-row ${
        isUser ? "message-row--user" : "message-row--bot"
      }`}
    >
      <div
        className={`bubble ${
          isUser ? "user-bubble" : "bot-bubble"
        } ${isError ? "bubble-error" : ""}`}
      >
        <p>{text}</p>

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