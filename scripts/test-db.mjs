// Starts an in-memory PGlite Postgres on a local port and applies all migrations.
// Used by vitest globalSetup when TEST_DATABASE_URL is not provided.
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export async function startTestDb(port = 54329) {
  const db = await PGlite.create();
  const dir = path.resolve("prisma/migrations");
  for (const m of readdirSync(dir).filter((d) => /^\d/.test(d)).sort()) {
    await db.exec(readFileSync(path.join(dir, m, "migration.sql"), "utf8"));
  }
  const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1" });
  await server.start();
  return {
    url: `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`,
    stop: async () => { await server.stop(); await db.close(); },
  };
}
