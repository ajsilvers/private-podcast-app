import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateFeed } from "@/lib/feed-generator";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const subscriber = await db.subscriber.findUnique({
      where: { feedToken: token },
      include: {
        show: {
          include: { episodes: true },
        },
      },
    });

    if (!subscriber || subscriber.status === "REVOKED") {
      return new NextResponse("Feed not found", { status: 404 });
    }

    // Log request for analytics
    await db.feedRequest.create({
      data: {
        subscriberId: subscriber.id,
        userAgent: request.headers.get("user-agent"),
        ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
                   request.headers.get("x-real-ip") ||
                   "unknown",
      },
    });

    // Mark as activated on first request
    if (!subscriber.activatedAt) {
      await db.subscriber.update({
        where: { id: subscriber.id },
        data: { activatedAt: new Date() },
      });
    }

    const feedXml = generateFeed(
      subscriber.show,
      subscriber,
      process.env.NEXT_PUBLIC_APP_URL!
    );

    return new NextResponse(feedXml, {
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Feed generation error:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
