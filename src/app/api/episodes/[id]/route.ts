import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { db } from "@/lib/db";

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

    console.log("Episode update body:", JSON.stringify(body, null, 2));

    const updateData: Record<string, unknown> = {
      title: body.title,
      description: body.description || null,
      audioUrl: body.audioUrl,
      durationSeconds: body.durationSeconds,
      fileSizeBytes: body.fileSizeBytes,
      isPublished: body.isPublished,
    };

    // Only include imageUrl if it has a value
    if (body.imageUrl) {
      updateData.imageUrl = body.imageUrl;
    } else {
      updateData.imageUrl = null;
    }

    // Only include seasonNumber if it has a value
    if (body.seasonNumber) {
      updateData.seasonNumber = body.seasonNumber;
    } else {
      updateData.seasonNumber = null;
    }

    const episode = await db.episode.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ episode });
  } catch (error) {
    console.error("Update episode error:", error);
    return NextResponse.json({ 
      error: "Internal server error", 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
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
    
    // Get episode to find showId and episodeNumber
    const episode = await db.episode.findUnique({ where: { id } });
    if (!episode) {
      return NextResponse.json({ error: "Episode not found" }, { status: 404 });
    }

    // Delete episode
    await db.episode.delete({ where: { id } });

    // Reorder remaining episodes
    const remainingEpisodes = await db.episode.findMany({
      where: { showId: episode.showId },
      orderBy: { episodeNumber: "asc" },
    });

    // Update episode numbers
    for (let i = 0; i < remainingEpisodes.length; i++) {
      await db.episode.update({
        where: { id: remainingEpisodes[i].id },
        data: { episodeNumber: i + 1 },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete episode error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
