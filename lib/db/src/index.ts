import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@workspace/db/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// Neon closes idle connections (compute suspend, maintenance, network blips). The pool
// reports that as an "error" event on an idle client; with no listener Node treats it
// as an uncaught exception and the whole API exits with status 1. The pool drops the
// dead client and opens a new one on the next query, so logging it is all that's needed.
pool.on("error", (err) => {
  console.error("[db] idle connection closed by the database:", err.message);
});
export const db = drizzle(pool, { schema });

export * from "@workspace/db/schema";
