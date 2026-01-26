import pg from "pg";

const { Pool } = pg;

const sslEnabled = process.env.PGSSL === "true";
const localUser = process.env.PGUSER || process.env.USER || "postgres";
const connectionString =
  process.env.DATABASE_URL ||
  `postgres://${localUser}@localhost:5432/meeting_room_booking`;

export const pool = new Pool({
  connectionString,
  ssl: sslEnabled ? { rejectUnauthorized: false } : undefined
});

export async function withClient(callback) {
  const client = await pool.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}
