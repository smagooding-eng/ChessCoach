// Run manually via Render's Shell tab:
//   node /repo/lib/db/scripts/create-correspondence-tables.mjs
//
// Uses the pg driver directly -- see create-shop-items-table.mjs in this
// same folder for why (plain `node` can't resolve @workspace/db's own
// internal module graph the way a bundler does).

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set in this environment. Run this somewhere with the same DATABASE_URL as the live server (e.g. Render's Shell tab for this service).");
    process.exit(1);
  }

  console.log("Connecting directly via pg...");
  const pg = (await import("pg")).default;
  const { Client } = pg;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    console.log("Creating correspondence_games table (if it doesn't already exist)...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS correspondence_games (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        time_control varchar NOT NULL,
        white_user_id varchar NOT NULL,
        black_user_id varchar NOT NULL,
        white_username varchar NOT NULL,
        black_username varchar NOT NULL,
        white_is_bot integer NOT NULL DEFAULT 0,
        black_is_bot integer NOT NULL DEFAULT 0,
        pgn text NOT NULL DEFAULT '',
        fen text NOT NULL,
        turn_user_id varchar NOT NULL,
        white_bank_ms integer NOT NULL,
        black_bank_ms integer NOT NULL,
        last_move_at timestamptz NOT NULL DEFAULT now(),
        status varchar NOT NULL DEFAULT 'active',
        result varchar,
        termination varchar,
        started_at timestamptz NOT NULL DEFAULT now(),
        finished_at timestamptz
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_correspondence_white_user ON correspondence_games (white_user_id, status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_correspondence_black_user ON correspondence_games (black_user_id, status)`);

    console.log("Creating correspondence_queue table (if it doesn't already exist)...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS correspondence_queue (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL,
        username varchar NOT NULL,
        time_control varchar NOT NULL,
        joined_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    console.log("\nVerifying both tables now exist...");
    for (const table of ["correspondence_games", "correspondence_queue"]) {
      const result = await client.query(`
        SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = $1 ORDER BY ordinal_position
      `, [table]);
      if (!result.rows || result.rows.length === 0) {
        console.error(`\nSTILL MISSING: ${table} has no columns even after this ran without throwing.`);
        process.exit(1);
      }
      console.log(`${table}: ${result.rows.length} column(s) confirmed.`);
    }
    console.log("\nDone. Correspondence chess is safe to use now.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  console.error("Message:", err?.message);
  process.exit(1);
});
