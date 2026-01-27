import pg from "pg";

const { Pool } = pg;

const poolConfig = {
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  database: process.env.DB_NAME || "meeting_room_db",
  host: process.env.DB_HOST || "localhost",
  port: 5432,
  ssl: false
};

export const pool = new Pool(poolConfig);

// Startup health check
pool.query("SELECT NOW()")
  .then(() => {
    console.log("DB connected successfully");
  })
  .catch((err) => {
    console.error("DB connection error:", err.message);
  });

export async function withClient(callback) {
  const client = await pool.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}
