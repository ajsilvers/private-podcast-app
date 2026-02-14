import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { db } from "@/lib/db";

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
    const body = await request.json();

    const show = await db.show.update({
      where: { id },
      data: {
        title: body.title,
        description: body.description,
        authorName: body.authorName,
        authorEmail: body.authorEmail,
        coverArtUrl: body.coverArtUrl || null,
        feedType: body.feedType,
        dripIntervalDays: body.feedType === "DRIP" ? body.dripIntervalDays : null,
      },
    });

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
