import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { db } from "@/lib/db";
import { nanoid } from "nanoid";
import { z } from "zod";

const AddSubscriberSchema = z.object({
  email: z.string().email("Valid email is required"),
  name: z.string().optional(),
  startDate: z.string().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = 20;
    const skip = (page - 1) * limit;

    const where = {
      showId: id,
      ...(search ? { email: { contains: search, mode: "insensitive" as const } } : {}),
    };

    const [subscribers, total] = await Promise.all([
      db.subscriber.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      db.subscriber.count({ where }),
    ]);

    return NextResponse.json({
      subscribers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get subscribers error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const parsed = AddSubscriberSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    // Check for existing subscriber
    const existing = await db.subscriber.findUnique({
      where: { showId_email: { showId: id, email: parsed.data.email } },
    });

    if (existing) {
      // Reactivate if revoked
      if (existing.status === "REVOKED") {
        const reactivated = await db.subscriber.update({
          where: { id: existing.id },
          data: {
            status: "ACTIVE",
            startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : new Date(),
          },
        });
        return NextResponse.json({ subscriber: reactivated, feedUrl: getFeedUrl(reactivated.feedToken) });
      }
      return NextResponse.json({ subscriber: existing, feedUrl: getFeedUrl(existing.feedToken) });
    }

    const subscriber = await db.subscriber.create({
      data: {
        showId: id,
        email: parsed.data.email,
        name: parsed.data.name,
        feedToken: nanoid(32),
        startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : new Date(),
      },
    });

    return NextResponse.json({ subscriber, feedUrl: getFeedUrl(subscriber.feedToken) }, { status: 201 });
  } catch (error) {
    console.error("Create subscriber error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function getFeedUrl(token: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL}/api/feeds/${token}`;
}
