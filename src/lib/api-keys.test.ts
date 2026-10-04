import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
import { generateApiKey, hashApiKey, parseBearer } from "./api-keys";

describe("api keys", () => {
  it("generates a prefixed key whose hash verifies", () => {
    const k = generateApiKey();
    expect(k.raw).toMatch(/^lcf_live_[A-Za-z0-9_-]{32}$/);
    expect(k.prefix).toBe(k.raw.slice(0, 12));
    expect(hashApiKey(k.raw)).toBe(k.hash);
  });
  it("parses only strict Bearer syntax", () => {
    expect(parseBearer("Bearer abc")).toBe("abc");
    expect(parseBearer("bearer abc")).toBe("abc");
    expect(parseBearer("abc")).toBeNull();
    expect(parseBearer("Bearer ")).toBeNull();
    expect(parseBearer(null)).toBeNull();
  });
});
