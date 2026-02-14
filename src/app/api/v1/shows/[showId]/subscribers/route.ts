import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { nanoid } from "nanoid";
import { z } from "zod";

const AddSubscriberSchema = z.object({
  email: z.string().email("Valid email is required"),
  name: z.string().optional(),
  start_date: z.string().datetime().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ showId: string }> }
) {
  try {
    // Authenticate via API key
    const apiKey = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!apiKey) {
      return NextResponse.json({ error: "Unauthorized - API key required" }, { status: 401 });
    }

    const user = await db.user.findUnique({ where: { apiKey } });
    if (!user) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    const { showId } = await params;

    // Verify show belongs to user
    const show = await db.show.findFirst({
      where: { id: showId, userId: user.id },
    });

    if (!show) {
      return NextResponse.json({ error: "Show not found" }, { status: 404 });
    }

    // Validate request body
    const body = await request.json();
    const parsed = AddSubscriberSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    const { email, name, start_date } = parsed.data;

    // Check for existing subscriber
    const existing = await db.subscriber.findUnique({
      where: { showId_email: { showId, email } },
    });

    const feedUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/feeds/`;

    if (existing) {
      // Reactivate if revoked
      if (existing.status === "REVOKED") {
        const reactivated = await db.subscriber.update({
          where: { id: existing.id },
          data: {
            status: "ACTIVE",
            startDate: start_date ? new Date(start_date) : new Date(),
          },
        });
        return NextResponse.json({
          id: reactivated.id,
          email: reactivated.email,
          name: reactivated.name,
          feed_url: `${feedUrl}${reactivated.feedToken}`,
          status: "active",
          start_date: reactivated.startDate.toISOString(),
          activated: !!reactivated.activatedAt,
        });
      }

      // Return existing active subscriber
      return NextResponse.json({
        id: existing.id,
        email: existing.email,
        name: existing.name,
        feed_url: `${feedUrl}${existing.feedToken}`,
        status: "active",
        start_date: existing.startDate.toISOString(),
        activated: !!existing.activatedAt,
      });
    }

    // Create new subscriber
    const subscriber = await db.subscriber.create({
      data: {
        showId,
        email,
        name,
        feedToken: nanoid(32),
        startDate: start_date ? new Date(start_date) : new Date(),
      },
    });

    return NextResponse.json({
      id: subscriber.id,
      email: subscriber.email,
      name: subscriber.name,
      feed_url: `${feedUrl}${subscriber.feedToken}`,
      status: "active",
      start_date: subscriber.startDate.toISOString(),
      activated: false,
    }, { status: 201 });
  } catch (error) {
    console.error("Webhook add subscriber error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ showId: string }> }
) {
  try {
    // Authenticate via API key
    const apiKey = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!apiKey) {
      return NextResponse.json({ error: "Unauthorized - API key required" }, { status: 401 });
    }

    const user = await db.user.findUnique({ where: { apiKey } });
    if (!user) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    const { showId } = await params;

    // Verify show belongs to user
    const show = await db.show.findFirst({
      where: { id: showId, userId: user.id },
    });

    if (!show) {
      return NextResponse.json({ error: "Show not found" }, { status: 404 });
    }

    const subscribers = await db.subscriber.findMany({
      where: { showId },
      orderBy: { createdAt: "desc" },
    });

    const activated = subscribers.filter(s => s.activatedAt).length;

    return NextResponse.json({
      subscribers: subscribers.map(s => ({
        id: s.id,
        email: s.email,
        name: s.name,
        status: s.status.toLowerCase(),
        activated: !!s.activatedAt,
        start_date: s.startDate.toISOString(),
      })),
      total: subscribers.length,
      active: subscribers.filter(s => s.status === "ACTIVE").length,
      activated,
    });
  } catch (error) {
    console.error("Webhook get subscribers error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
