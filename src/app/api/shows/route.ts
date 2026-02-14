import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const CreateShowSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  authorName: z.string().min(1, "Author name is required"),
  authorEmail: z.string().email("Valid email is required"),
  coverArtUrl: z.string().url().optional().or(z.literal("")),
  feedType: z.enum(["BINGE", "DRIP"]),
  dripIntervalDays: z.number().int().min(1).max(7).optional(),
});

export async function GET() {
  try {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Single user system - get first user
    const user = await db.user.findFirst();
    if (!user) {
      return NextResponse.json({ shows: [] });
    }

    const shows = await db.show.findMany({
      where: { userId: user.id },
      include: {
        _count: {
          select: { episodes: true, subscribers: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ shows });
  } catch (error) {
    console.error("Get shows error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = CreateShowSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    // Single user system - get or create user
    let user = await db.user.findFirst();
    if (!user) {
      user = await db.user.create({
        data: {
          email: "admin@privatepodcast.local",
          name: "Admin",
        },
      });
    }

    const show = await db.show.create({
      data: {
        userId: user.id,
        title: parsed.data.title,
        description: parsed.data.description,
        authorName: parsed.data.authorName,
        authorEmail: parsed.data.authorEmail,
        coverArtUrl: parsed.data.coverArtUrl || null,
        feedType: parsed.data.feedType,
        dripIntervalDays: parsed.data.feedType === "DRIP" ? (parsed.data.dripIntervalDays ?? 1) : null,
      },
    });

    return NextResponse.json({ show }, { status: 201 });
  } catch (error) {
    console.error("Create show error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
