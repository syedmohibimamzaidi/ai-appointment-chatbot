const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

function getConversationId() {
  let id = localStorage.getItem("conversationId");
  if (!id) {
    // crypto.randomUUID is available on all modern browsers + iOS Safari 15.4+
    id =
      (crypto.randomUUID && crypto.randomUUID()) ||
      String(Date.now()) + Math.random().toString(36).slice(2);
    localStorage.setItem("conversationId", id);
  }
  return id;
}

export async function sendMessage(message) {
  const res = await fetch(`${API_BASE_URL}/chatbot`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, conversationId: getConversationId() }),
  });

  if (!res.ok) {
    throw new Error(`HTTP error ${res.status}`);
  }

  return await res.json();
}
