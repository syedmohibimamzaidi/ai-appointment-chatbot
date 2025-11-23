import { run, all } from "./db.js";

async function main() {
  // 1) Clear existing data (optional while testing)
  await run("DELETE FROM hours");
  await run("DELETE FROM blackouts");

  // 2) Insert working hours
  // dow: 0=Sun, 1=Mon, ..., 6=Sat
  const hours = [
    [1, "09:00", "17:00"], // Mon
    [2, "09:00", "17:00"], // Tue
    [3, "09:00", "17:00"], // Wed
    [4, "09:00", "17:00"], // Thu
    [5, "09:00", "17:00"], // Fri
  ];

  for (const [dow, open, close] of hours) {
    await run("INSERT INTO hours (dow, open, close) VALUES (?, ?, ?)", [
      dow,
      open,
      close,
    ]);
  }

  // 3) Insert a blackout on 2025-11-17
  await run("INSERT INTO blackouts (date, note) VALUES (?, ?)", [
    "2025-11-17",
    "Shop closed for renovation",
  ]);

  // 4) Log to confirm
  console.log("hours:", await all("SELECT * FROM hours"));
  console.log("blackouts:", await all("SELECT * FROM blackouts"));
}

main()
  .then(() => {
    console.log("Seeding done.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Seeding failed:", err);
    process.exit(1);
  });
