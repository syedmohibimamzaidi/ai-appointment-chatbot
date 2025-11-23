import { readFileSync } from "fs";
import { run } from "../db.js";

const sql = readFileSync("./scripts/migrate_v2.sql", "utf8");
const statements = sql
  .split(/;\s*\n/)
  .map((s) => s.trim())
  .filter(Boolean);

(async () => {
  for (const stmt of statements) {
    try {
      await run(stmt);
    } catch (e) {
      console.error("Migration error:", e, "\nSQL:", stmt);
    }
  }
  console.log("✅ Migration complete");
  process.exit(0);
})();
