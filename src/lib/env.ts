import { z } from "zod";

const KNOWN_BAD = "complex_password_at_least_32_characters_long";

const Schema = z.object({
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32).refine((s) => s !== KNOWN_BAD),
  ADMIN_PASSWORD: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

export function parseEnv(src: Record<string, string | undefined>) {
  const r = Schema.safeParse(src);
  if (!r.success) {
    const names = [...new Set(r.error.issues.map((i) => String(i.path[0])))].join(", ");
    throw new Error(`Missing or invalid env: ${names}`);
  }
  return {
    DATABASE_URL: r.data.DATABASE_URL,
    SESSION_SECRET: r.data.SESSION_SECRET,
    ADMIN_PASSWORD: r.data.ADMIN_PASSWORD,
    APP_URL: r.data.NEXT_PUBLIC_APP_URL.replace(/\/+$/, ""),
  };
}

let cached: ReturnType<typeof parseEnv> | undefined;
export function getEnv() {
  return (cached ??= parseEnv(process.env));
}
