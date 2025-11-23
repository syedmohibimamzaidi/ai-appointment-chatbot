import { all } from "../db.js";

try {
  const tables = await all(
    "SELECT name FROM sqlite_master WHERE type='table'",
    []
  );

  console.log("Tables in app.db:");
  console.log(tables);
} catch (err) {
  console.error("Error checking tables:", err);
}
