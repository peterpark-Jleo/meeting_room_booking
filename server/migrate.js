import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlDir = path.join(__dirname, "..", "sql");

async function run() {
  await pool.query(
    `create table if not exists migrations (
      id serial primary key,
      filename text not null unique,
      applied_at timestamptz not null default now()
    )`
  );

  const files = (await fs.readdir(sqlDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  if (!files.length) {
    console.log("No migrations found.");
    return;
  }

  const appliedResult = await pool.query("select filename from migrations");
  const applied = new Set(appliedResult.rows.map((row) => row.filename));

  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }
    const filePath = path.join(sqlDir, file);
    const sql = await fs.readFile(filePath, "utf8");
    console.log(`Running ${file}...`);
    await pool.query(sql);
    await pool.query("insert into migrations (filename) values ($1)", [file]);
  }

  console.log("Migrations complete.");
}

run()
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
