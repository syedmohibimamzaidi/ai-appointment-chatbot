import { useEffect, useRef } from "react";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";

export default function ChatWindow({ messages, isTyping }) {
  const bottomRef = useRef(null);

  // Smoothly scroll to the newest message whenever the list grows
  // or the typing indicator appears/disappears.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, isTyping]);

  return (
    <div className="chat-window">
      {messages.map((msg, i) => (
        <MessageBubble
          key={msg.id ?? i}
          sender={msg.sender}
          text={msg.text}
          createdAt={msg.createdAt}
          status={msg.status}
          isError={msg.isError}
          messageType={msg.messageType}
          bookingDraft={msg.bookingDraft}
        />
      ))}

      {isTyping && <TypingIndicator />}

      {/* Sentinel: an invisible anchor at the very bottom of the list.
          We scroll this element into view to follow new messages. */}
      <div ref={bottomRef} />
    </div>
  );
}
