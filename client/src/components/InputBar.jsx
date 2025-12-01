import { useState, useRef, useEffect } from "react";

export default function InputBar({ onSend }) {
  const [value, setValue] = useState("");
  const textareaRef = useRef(null);

  // Auto-resize textarea height
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    const scrollHeight = el.scrollHeight;
    el.style.height = Math.min(scrollHeight, 120) + "px";
  }, [value]);

  function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="input-bar">
      <textarea
        ref={textareaRef}
        className="input-field"
        placeholder="Type a message..."
        rows={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <button className="send-button" onClick={handleSubmit}>
        Send
      </button>
    </div>
  );
}