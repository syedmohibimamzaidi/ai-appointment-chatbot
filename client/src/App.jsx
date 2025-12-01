import { useState } from "react";
import ChatWindow from "./components/ChatWindow";
import InputBar from "./components/InputBar";
import { sendMessage } from "./api";
import "./index.css"; // main global styles

function App() {
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);

  async function handleSend(userText) {
    const trimmed = userText.trim();
    if (!trimmed) return;

    const now = new Date();

    const userMessage = {
      id: Date.now(),
      sender: "user",
      text: trimmed,
      createdAt: now.toISOString(),
      status: "sent",
    };

    setMessages((prev) => [...prev, userMessage]);

    try {
      setIsTyping(true);

      const response = await sendMessage(trimmed);

      const botMessage = {
        id: Date.now() + 1,
        sender: "bot",
        text: response.reply,
        raw: response,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (err) {
      console.error("chat error:", err);
      const errorMessage = {
        id: Date.now() + 2,
        sender: "bot",
        text: "⚠️ Error talking to server. Please try again.",
        createdAt: new Date().toISOString(),
        isError: true,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  }

  return (
    <div className="app-shell">
      <div className="chat-card">
        <header className="chat-header">
          <div>
            <h1>Salon Assistant</h1>
            <p>Book haircuts & services through chat.</p>
          </div>
          <div className="chat-status">
            <span className="status-dot" />
            <span>Online</span>
          </div>
        </header>

        <ChatWindow messages={messages} isTyping={isTyping} />
        <InputBar onSend={handleSend} />
      </div>
    </div>
  );
}

export default App;