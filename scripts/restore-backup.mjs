import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");
const requireFromProject = createRequire(path.join(projectRoot, "package.json"));
const postgres = requireFromProject("postgres");
const url = process.env.DATABASE_URL ?? "postgres://postgres@127.0.0.1:5432/agilecampus";
const input = process.argv[2];

if (!input) {
  throw new Error("Usage: node scripts/restore-backup.mjs <backup.json>");
}

const backup = JSON.parse(fs.readFileSync(input, "utf8"));
const tables = [
  "users",
  "teams",
  "team_members",
  "team_invitations",
  "projects",
  "milestones",
  "tasks",
  "conversations",
  "messages",
  "task_dependencies",
  "api_tokens",
  "resource_usages",
  "labels",
  "task_labels",
  "project_files",
  "project_comments",
];
const sql = postgres(url, { max: 1, prepare: false });

async function insertRows(tx, table, rows) {
  const columns = Object.keys(rows[0]);
  const quotedTable = `"public"."${table.replaceAll('"', '""')}"`;
  const quotedColumns = columns
    .map((column) => `"${column.replaceAll('"', '""')}"`)
    .join(", ");
  const values = [];
  const placeholders = rows.map((row) => {
    const rowValues = columns.map((column) => {
      values.push(row[column]);
      return `$${values.length}`;
    });
    return `(${rowValues.join(", ")})`;
  });
  await tx.unsafe(
    `insert into ${quotedTable} (${quotedColumns}) values ${placeholders.join(", ")}`,
    values,
  );
}

await sql.begin(async (tx) => {
  for (const table of tables) {
    const rows = backup.data?.[table] ?? [];
    if (rows.length === 0) continue;
    await insertRows(tx, table, rows);
    console.log(`${table}: restored ${rows.length}`);
  }
});
await sql.end();
console.log("Restore complete.");
