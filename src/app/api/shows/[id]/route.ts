import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { ShowPatchSchema, lockedFieldViolations, datedConversionBlockers } from "@/lib/show-settings";

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
    const show = await db.show.findUnique({
      where: { id },
      include: {
        episodes: {
          orderBy: { episodeNumber: "asc" },
        },
        _count: {
          select: { subscribers: true },
        },
      },
    });

    if (!show) {
      return NextResponse.json({ error: "Show not found" }, { status: 404 });
    }

    // Get subscriber stats
    const subscriberStats = await db.subscriber.aggregate({
      where: { showId: id },
      _count: true,
    });

    const activatedCount = await db.subscriber.count({
      where: { showId: id, activatedAt: { not: null } },
    });

    return NextResponse.json({
      show,
      stats: {
        totalSubscribers: subscriberStats._count,
        activatedCount,
        activationRate: subscriberStats._count > 0 
          ? Math.round((activatedCount / subscriberStats._count) * 100) 
          : 0,
      },
    });
  } catch (error) {
    console.error("Get show error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Malformed JSON" }, { status: 400 });
    }
    const parsed = ShowPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    const current = await db.show.findUnique({
      where: { id },
      include: {
        _count: { select: { subscribers: true } },
        episodes: { select: { episodeNumber: true, isPublished: true, releaseAt: true } },
      },
    });
    if (!current) {
      return NextResponse.json({ error: "Show not found" }, { status: 404 });
    }
    const locked = lockedFieldViolations(parsed.data, current, current._count.subscribers);
    if (locked.length > 0) {
      return NextResponse.json({ error: "locked_after_subscribers", fields: locked }, { status: 409 });
    }

    if (parsed.data.feedType === "DATED" && current.feedType !== "DATED") {
      const missing = datedConversionBlockers(current.episodes);
      if (missing.length > 0) {
        return NextResponse.json(
          { error: "Set a release date on published episodes first, or unpublish them", episodes: missing },
          { status: 400 }
        );
      }
    }

    // Only fields present in the request change; omitted values are kept.
    const data: Prisma.ShowUpdateInput = { ...parsed.data };
    if (parsed.data.coverArtUrl !== undefined) data.coverArtUrl = parsed.data.coverArtUrl || null;
    const feedType = parsed.data.feedType ?? current.feedType;
    if (feedType !== "DRIP") data.dripIntervalDays = null;
    else if (parsed.data.dripIntervalDays === undefined && current.dripIntervalDays === null) data.dripIntervalDays = 1;

    let show;
    try {
      show = await db.show.update({ where: { id }, data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return NextResponse.json({ error: "slug_taken" }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ show });
  } catch (error) {
    console.error("Update show error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await db.show.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete show error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
