import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { z } from "zod";
import { authenticateKey } from "@/lib/api-keys";
import { subscribe, feedUrl } from "@/lib/subscribe";

// Legacy provision-by-show-id endpoint. New integrations use POST /api/v1/subscribe.
const AddSubscriberSchema = z.object({
  email: z.string().trim().email("Valid email is required"),
  name: z.string().optional(),
});

type Ctx = { params: Promise<{ showId: string }> };

async function authorize(request: NextRequest, showId: string) {
  const key = await authenticateKey(request.headers.get("authorization"));
  if (!key) return NextResponse.json({ error: "Unauthorized - API key required" }, { status: 401 });
  if (!key.showIds.includes(showId)) return NextResponse.json({ error: "Show not found" }, { status: 404 });
  return null;
}

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const { showId } = await params;
    const denied = await authorize(request, showId);
    if (denied) return denied;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Malformed JSON" }, { status: 400 });
    }
    const parsed = AddSubscriberSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    const result = await subscribe({ showId, email: parsed.data.email, name: parsed.data.name ?? null });
    if (result.kind === "revoked") {
      return NextResponse.json({ error: "Subscriber revoked" }, { status: 409 });
    }

    const s = result.subscriber;
    return NextResponse.json(
      {
        id: s.id,
        email: s.email,
        name: s.name,
        feed_url: feedUrl(s.feedToken),
        status: "active",
        start_date: s.startDate.toISOString(),
        activated: !!s.activatedAt,
      },
      { status: result.created ? 201 : 200 }
    );
  } catch (error) {
    console.error("Webhook add subscriber error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const { showId } = await params;
    const denied = await authorize(request, showId);
    if (denied) return denied;

    const subscribers = await db.subscriber.findMany({
      where: { showId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      subscribers: subscribers.map((s) => ({
        id: s.id,
        email: s.email,
        name: s.name,
        status: s.status.toLowerCase(),
        activated: !!s.activatedAt,
        start_date: s.startDate.toISOString(),
      })),
      total: subscribers.length,
      active: subscribers.filter((s) => s.status === "ACTIVE").length,
      activated: subscribers.filter((s) => s.activatedAt).length,
    });
  } catch (error) {
    console.error("Webhook get subscribers error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
