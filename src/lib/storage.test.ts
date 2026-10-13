import { describe, it, expect, beforeAll } from "vitest";

describe("storage (Bunny S3-compatible)", () => {
  let storage: typeof import("./storage");

  beforeAll(async () => {
    process.env.STORAGE_ENDPOINT = "https://uk-s3.storage.bunnycdn.com";
    process.env.STORAGE_REGION = "uk";
    process.env.STORAGE_ACCESS_KEY_ID = "launchcast-media";
    process.env.STORAGE_SECRET_ACCESS_KEY = "zone-password";
    process.env.STORAGE_BUCKET = "launchcast-media";
    process.env.STORAGE_PUBLIC_URL = "https://media.launchcastformula.com/";
    storage = await import("./storage");
  });

  it("presigns a path-style PUT signed for the storage region", async () => {
    const url = new URL(await storage.getUploadUrl("audio/abc.mp3", "audio/mpeg"));
    expect(url.host).toBe("uk-s3.storage.bunnycdn.com");
    expect(url.pathname).toBe("/launchcast-media/audio/abc.mp3");
    expect(url.searchParams.get("X-Amz-Credential")).toMatch(/^launchcast-media\/\d{8}\/uk\/s3\/aws4_request$/);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
  });

  it("adds no SDK checksum parameters (Bunny only validates SHA-256 when sent explicitly)", async () => {
    const url = new URL(await storage.getUploadUrl("audio/abc.mp3", "audio/mpeg"));
    const params = [...url.searchParams.keys()].map((k) => k.toLowerCase());
    expect(params.filter((k) => k.includes("checksum"))).toEqual([]);
  });

  it("builds public CDN URLs without a double slash", () => {
    expect(storage.getPublicUrl("audio/abc.mp3")).toBe("https://media.launchcastformula.com/audio/abc.mp3");
  });
});
