// One-time import of a curated Lichess puzzle set into the puzzles table.
// Usage: DATABASE_URL="..." node scripts/import-lichess-puzzles.mjs path/to/curated_puzzles_final.csv
//
// Requires the `pg` package, which is already a dependency of lib/db.
// Run from the monorepo root so node_modules resolves correctly.

import { readFileSync } from "fs";
import pg from "pg";

const { Client } = pg;

function parseCsv(text) {
  // Simple RFC4180-ish CSV parser — handles quoted fields with commas inside
  // (needed for the themes column, e.g. "fork,pin,skewer").
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\r") { /* skip */ }
      else if (c === "\n") { row.push(field); field = ""; rows.push(row); row = []; }
      else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1);
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: node scripts/import-lichess-puzzles.mjs <csv-file>");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("Set DATABASE_URL first, same as for drizzle-kit push.");
    process.exit(1);
  }

  const raw = readFileSync(filePath, "utf8");
  const rows = parseCsv(raw);
  const header = rows[0];
  const dataRows = rows.slice(1);
  console.log(`Loaded ${dataRows.length} puzzles from ${filePath}`);

  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const BATCH_SIZE = 500;
  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < dataRows.length; i += BATCH_SIZE) {
    const batch = dataRows.slice(i, i + BATCH_SIZE);
    const values = [];
    const placeholders = batch.map((row, idx) => {
      const [lichessId, fen, moves, rating, themes] = row;
      const base = idx * 6;
      values.push(lichessId, fen, moves, parseInt(rating, 10) || 1200, themes, "lichess");
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
    }).join(",");

    const sql = `
      INSERT INTO puzzles (lichess_id, fen, moves, rating, themes, source)
      VALUES ${placeholders}
      ON CONFLICT (lichess_id) WHERE lichess_id IS NOT NULL DO NOTHING
    `;
    const result = await client.query(sql, values);
    inserted += result.rowCount ?? 0;
    skipped += batch.length - (result.rowCount ?? 0);
    if ((i / BATCH_SIZE) % 10 === 0) {
      console.log(`  ...${i + batch.length}/${dataRows.length} processed (${inserted} inserted, ${skipped} skipped as duplicates)`);
    }
  }

  console.log(`\nDone. Inserted ${inserted} new puzzles, skipped ${skipped} duplicates.`);
  await client.end();
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
