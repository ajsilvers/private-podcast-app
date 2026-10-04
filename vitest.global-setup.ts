import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}

// DB tests run against TEST_DATABASE_URL when set (e.g. a throwaway Neon branch),
// otherwise against an in-memory PGlite Postgres with all migrations applied.
export default async function setup(project: TestProject) {
  if (process.env.TEST_DATABASE_URL) {
    project.provide("testDatabaseUrl", process.env.TEST_DATABASE_URL);
    return;
  }
  const { startTestDb } = await import("./scripts/test-db.mjs");
  const { url, stop } = await startTestDb();
  project.provide("testDatabaseUrl", url);
  return stop;
}
