import { describe, it, expect } from "vitest";
import { parseEnv } from "./env";

const good = {
  DATABASE_URL: "postgresql://u:p@h/db",
  SESSION_SECRET: "x".repeat(32),
  ADMIN_PASSWORD: "pw",
  NEXT_PUBLIC_APP_URL: "https://feeds.launchcastformula.com",
};

describe("parseEnv", () => {
  it("accepts a complete env and strips trailing slash", () => {
    expect(parseEnv({ ...good, NEXT_PUBLIC_APP_URL: good.NEXT_PUBLIC_APP_URL + "/" }).APP_URL)
      .toBe("https://feeds.launchcastformula.com");
  });
  it("rejects short or missing session secret", () => {
    expect(() => parseEnv({ ...good, SESSION_SECRET: "short" })).toThrow(/SESSION_SECRET/);
    const { SESSION_SECRET: _omit, ...rest } = good;
    expect(() => parseEnv(rest)).toThrow(/SESSION_SECRET/);
  });
  it("rejects the old hard-coded fallback secret", () => {
    expect(() => parseEnv({ ...good, SESSION_SECRET: "complex_password_at_least_32_characters_long" }))
      .toThrow(/SESSION_SECRET/);
  });
  it("rejects non-URL app url", () => {
    expect(() => parseEnv({ ...good, NEXT_PUBLIC_APP_URL: "feeds" })).toThrow(/NEXT_PUBLIC_APP_URL/);
  });
});
