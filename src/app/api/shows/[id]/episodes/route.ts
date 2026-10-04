import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";
import { publicationFields, ReleaseAtSchema } from "@/lib/episode-rules";

const CreateEpisodeSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  audioUrl: z.string().url("Audio URL is required"),
  imageUrl: z.string().optional().nullable(),
  durationSeconds: z.number().int().min(1),
  fileSizeBytes: z.number().int().min(1),
  seasonNumber: z.number().int().optional().nullable(),
  isPublished: z.boolean().optional(),
  releaseAt: ReleaseAtSchema,
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
    const episodes = await db.episode.findMany({
      where: { showId: id },
      orderBy: { episodeNumber: "asc" },
    });

    return NextResponse.json({ episodes });
  } catch (error) {
    console.error("Get episodes error:", error);
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
    
    const parsed = CreateEpisodeSchema.safeParse(body);
    
    if (!parsed.success) {
      console.error("Validation error:", parsed.error.issues);
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    const show = await db.show.findUnique({ where: { id }, select: { feedType: true } });
    if (!show) {
      return NextResponse.json({ error: "Show not found" }, { status: 404 });
    }
    const publication = publicationFields({
      feedType: show.feedType,
      existing: null,
      isPublished: parsed.data.isPublished ?? false,
      releaseAt: parsed.data.releaseAt,
    });
    if (!publication.ok) {
      return NextResponse.json({ error: publication.error }, { status: 400 });
    }

    // Get next episode number
    const lastEpisode = await db.episode.findFirst({
      where: { showId: id },
      orderBy: { episodeNumber: "desc" },
    });

    const episodeNumber = (lastEpisode?.episodeNumber ?? 0) + 1;

    const episode = await db.episode.create({
      data: {
        showId: id,
        title: parsed.data.title,
        description: parsed.data.description || null,
        audioUrl: parsed.data.audioUrl,
        imageUrl: parsed.data.imageUrl || null,
        durationSeconds: parsed.data.durationSeconds,
        fileSizeBytes: parsed.data.fileSizeBytes,
        episodeNumber,
        seasonNumber: parsed.data.seasonNumber || null,
        isPublished: parsed.data.isPublished ?? false,
        ...publication.data,
      },
    });

    return NextResponse.json({ episode }, { status: 201 });
  } catch (error) {
    console.error("Create episode error:", error);
    return NextResponse.json({ 
      error: "Internal server error", 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}
