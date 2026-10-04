import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { ShowSettingsSchema } from "@/lib/show-settings";


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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Malformed JSON" }, { status: 400 });
    }
    const parsed = ShowSettingsSchema.safeParse(body);
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

    let show;
    try {
      show = await db.show.create({
        data: {
          userId: user.id,
          slug: parsed.data.slug,
          acceptingSubscribers: parsed.data.acceptingSubscribers ?? true,
          title: parsed.data.title,
          description: parsed.data.description,
          authorName: parsed.data.authorName,
          authorEmail: parsed.data.authorEmail,
          coverArtUrl: parsed.data.coverArtUrl || null,
          feedType: parsed.data.feedType,
          dripIntervalDays: parsed.data.feedType === "DRIP" ? (parsed.data.dripIntervalDays ?? 1) : null,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return NextResponse.json({ error: "slug_taken" }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ show }, { status: 201 });
  } catch (error) {
    console.error("Create show error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
