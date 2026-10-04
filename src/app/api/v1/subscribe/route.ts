import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authenticateKey } from "@/lib/api-keys";
import { subscribe, feedUrl } from "@/lib/subscribe";

const MAX_BYTES = 8 * 1024;

// Strict: callers choose the feed and identify the person; the show owns cadence and start date.
const SubscribeBody = z.strictObject({
  feed: z.string().min(1).max(64),
  email: z.string().trim().max(254).email(),
  first_name: z.string().trim().max(100).optional(),
  name: z.string().trim().max(200).optional(),
  external_id: z.string().max(200).optional(),
});

function error(status: number, code: string, extra?: object) {
  return NextResponse.json({ error: code, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  try {
    const key = await authenticateKey(request.headers.get("authorization"));
    if (!key) return error(401, "unauthorized");

    const text = await request.text();
    if (Buffer.byteLength(text) > MAX_BYTES) return error(413, "payload_too_large");
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return error(400, "invalid_request", { issues: [{ message: "Malformed JSON" }] });
    }
    const parsed = SubscribeBody.safeParse(json);
    if (!parsed.success) return error(400, "invalid_request", { issues: parsed.error.issues });
    const { feed, email, first_name, name, external_id } = parsed.data;

    // Unknown feed and out-of-scope feed look identical, so keys can't enumerate feeds.
    const show = await db.show.findUnique({ where: { slug: feed } });
    if (!show || !key.showIds.includes(show.id)) return error(404, "feed_not_found");
    if (!show.acceptingSubscribers) return error(403, "feed_closed");

    const result = await subscribe({
      showId: show.id,
      email,
      name: first_name ?? name ?? null,
      externalRef: external_id ?? null,
    });
    if (result.kind === "revoked") return error(409, "subscriber_revoked");

    return NextResponse.json(
      {
        feed_url: feedUrl(result.subscriber.feedToken),
        subscriber_id: result.subscriber.id,
        feed: show.slug,
        status: "active",
        created: result.created,
        start_date: result.subscriber.startDate.toISOString(),
      },
      { status: result.created ? 201 : 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("Subscribe API error:", e instanceof Error ? e.message : e);
    return error(500, "internal_error");
  }
}
