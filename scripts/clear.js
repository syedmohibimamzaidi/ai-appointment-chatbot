// scripts/clear.js
import { run } from "../db.js";

(async () => {
  await run("DELETE FROM appointments");
  console.log("✅ Cleared all appointments");
  process.exit(0);
})();