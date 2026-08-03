/**
 * Applies the F19 constraint fix directly to Supabase via a plain SQL query.
 * Uses postgres-meta / rest-friendly path: since exec_sql isn't exposed we
 * connect with pg over the Supabase connection string derived from
 * SUPABASE_DB_URL if present, else falls back to constructing from SUPABASE
 * project vars. If no direct DB URL is available, prints the SQL for manual run.
 */
import { loadEnv } from './_env';
loadEnv();

const SQL = `
ALTER TABLE agent_tasks
  DROP CONSTRAINT IF EXISTS agent_tasks_status_check;
ALTER TABLE agent_tasks
  ADD  CONSTRAINT agent_tasks_status_check
    CHECK (status IN ('pending','in_progress','completed','partial','failed','cancelled','awaiting_plan_approval'));
`.trim();

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log('No direct Postgres URL in env (SUPABASE_DB_URL/POSTGRES_URL/DATABASE_URL).');
    console.log('Copy this into Supabase SQL editor and run:\n');
    console.log(SQL);
    process.exit(0);
  }

  const { Client } = await import('pg');
  const c = new Client({ connectionString: dbUrl });
  await c.connect();
  try {
    await c.query('BEGIN');
    await c.query(SQL);
    await c.query('COMMIT');
    console.log('✅ Constraint updated. New allowed statuses include awaiting_plan_approval.');
  } catch (err) {
    await c.query('ROLLBACK');
    throw err;
  } finally {
    await c.end();
  }
}
main().catch(err => { console.error(err); process.exit(1); });
