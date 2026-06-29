// Postgres connection pool, shared across the app.
// Config comes entirely from env (DATABASE_URL) — nothing hardcoded.
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
}

// Neon/Supabase require SSL. `rejectUnauthorized: false` is the standard
// setting for these managed providers' pooled connections.
const needsSsl = /sslmode=require/.test(process.env.DATABASE_URL) ||
  process.env.PGSSL === "true";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  max: 5,
});

export const query = (text, params) => pool.query(text, params);
