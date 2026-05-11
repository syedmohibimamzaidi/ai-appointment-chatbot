import { useEffect, useRef } from "react";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";

export default function ChatWindow({ messages, isTyping, onChipClick }) {
  const bottomRef = useRef(null);

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
          suggestions={msg.suggestions}
          onChipClick={onChipClick}
        />
      ))}

      {isTyping && <TypingIndicator />}

      <div ref={bottomRef} />
    </div>
  );
}
