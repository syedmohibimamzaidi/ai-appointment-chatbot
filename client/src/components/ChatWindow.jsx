import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";

export default function ChatWindow({ messages, isTyping }) {
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
        />
      ))}

      {isTyping && <TypingIndicator />}
    </div>
  );
}