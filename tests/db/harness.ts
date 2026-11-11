/**
 * Runs SQL as the same roles Supabase uses. Each call is one transaction that
 * switches to the role and sets the JWT claims exactly as PostgREST does, so
 * row level security and column grants behave as they will in production.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const ADMIN_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:54322/postgres";
const DB_NAME = "rally_test";

export type Actor =
  | { role: "anon" }
  | { role: "authenticated"; userId: string; label?: string }
  | { role: "service_role" };

export const anon: Actor = { role: "anon" };
export const service: Actor = { role: "service_role" };

let pool: pg.Pool;

export async function resetDatabase() {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${DB_NAME} with (force)`);
  await admin.query(`create database ${DB_NAME}`);
  await admin.end();

  const url = new URL(ADMIN_URL);
  url.pathname = `/${DB_NAME}`;
  pool = new pg.Pool({ connectionString: url.toString(), max: 4 });

  const root = path.join(__dirname, "../..");
  await pool.query(readFileSync(path.join(__dirname, "supabase-stub.sql"), "utf8"));
  const migrations = readdirSync(path.join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
  for (const m of migrations) {
    await pool.query(readFileSync(path.join(root, "supabase/migrations", m), "utf8"));
  }
}

export async function closeDatabase() {
  await pool?.end();
}

/** Run one statement as an actor. Throws Postgres errors. */
export async function sql<T = Record<string, unknown>>(actor: Actor, text: string, params: unknown[] = []): Promise<T[]> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${actor.role}`);
    const claims =
      actor.role === "authenticated"
        ? { sub: actor.userId, role: "authenticated" }
        : { role: actor.role };
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    const res = await client.query(text, params);
    await client.query("commit");
    return res.rows as T[];
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** As the project owner in the SQL Editor (bypasses RLS). */
export async function owner<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await pool.query(text, params)).rows as T[];
}
