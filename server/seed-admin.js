import "dotenv/config";
import readline from "node:readline/promises";
import bcrypt from "bcryptjs";
import { pool } from "./db.js";

async function prompt(question, defaultValue) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim() || defaultValue;
}

async function run() {
  const email = await prompt("Admin email [admin@company.com]: ", "admin@company.com");
  const name = await prompt("Admin name [Admin]: ", "Admin");
  const company = await prompt("Company name [Company]: ", "Company");
  const password = await prompt("Password [admin1234]: ", "admin1234");

  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    `insert into users (email, password_hash, name, company_name, role)
     values ($1, $2, $3, $4, 'admin')
     on conflict (email) do nothing`,
    [email, hash, name, company]
  );

  console.log("Admin user ensured.");
}

run()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
