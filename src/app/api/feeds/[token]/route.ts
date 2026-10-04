import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateFeed } from "@/lib/feed-generator";
import { getEnv } from "@/lib/env";

type Ctx = { params: Promise<{ token: string }> };

const NO_STORE = "private, no-store, max-age=0";
const RSS_TYPE = "application/rss+xml; charset=utf-8";

async function loadActiveSubscriber(token: string) {
  const subscriber = await db.subscriber.findUnique({
    where: { feedToken: token },
    include: { show: { include: { episodes: true } } },
  });
  return subscriber && subscriber.status === "ACTIVE" ? subscriber : null;
}

/** Analytics must never delay or fail a feed: bounded wait, errors logged and swallowed. */
function bestEffort(work: Promise<unknown>, ms = 1500) {
  return Promise.race([work, new Promise((resolve) => setTimeout(resolve, ms))]).catch((error) =>
    console.error("Feed analytics failed:", error instanceof Error ? error.message : error)
  );
}

// Explicit HEAD so validators and link checkers don't log a request or mark activation.
export async function HEAD(_request: NextRequest, { params }: Ctx) {
  const subscriber = await loadActiveSubscriber((await params).token);
  return new NextResponse(null, {
    status: subscriber ? 200 : 404,
    headers: subscriber ? { "Content-Type": RSS_TYPE, "Cache-Control": NO_STORE } : { "Cache-Control": NO_STORE },
  });
}

export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const subscriber = await loadActiveSubscriber((await params).token);
    if (!subscriber) {
      return new NextResponse("Feed not found", { status: 404, headers: { "Cache-Control": NO_STORE } });
    }

    const feedXml = generateFeed(subscriber.show, subscriber, getEnv().APP_URL);

    await Promise.all([
      bestEffort(
        db.feedRequest.create({
          data: {
            subscriberId: subscriber.id,
            userAgent: request.headers.get("user-agent"),
            ipAddress:
              request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
              request.headers.get("x-real-ip") ||
              "unknown",
          },
        })
      ),
      subscriber.activatedAt
        ? Promise.resolve()
        : bestEffort(db.subscriber.update({ where: { id: subscriber.id }, data: { activatedAt: new Date() } })),
    ]);

    return new NextResponse(feedXml, { headers: { "Content-Type": RSS_TYPE, "Cache-Control": NO_STORE } });
  } catch (error) {
    console.error("Feed generation error:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
