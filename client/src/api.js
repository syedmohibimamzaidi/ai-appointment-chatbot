export async function sendMessage(message) {
  const res = await fetch("http://localhost:3000/chatbot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });

  if (!res.ok) {
    throw new Error(`HTTP error ${res.status}`);
  }

  return await res.json();
}
