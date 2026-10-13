import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { isAllowedAudio } from "@/lib/episode-rules";
import { getUploadUrl, generateStorageKey, getPublicUrl, getContentType } from "@/lib/storage";

export async function POST(request: NextRequest) {
  try {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { filename, type } = await request.json();

    if (!filename || typeof filename !== "string") {
      return NextResponse.json(
        { error: "Filename is required" },
        { status: 400 }
      );
    }

    const fileType = type === "image" ? "image" : "audio";
    if (fileType === "audio" && !isAllowedAudio(filename)) {
      return NextResponse.json({ error: "Audio must be an MP3 file" }, { status: 400 });
    }
    const contentType = getContentType(filename);
    const key = generateStorageKey(fileType, filename.split(".").pop() ?? "mp3");

    const uploadUrl = await getUploadUrl(key, contentType);
    const publicUrl = getPublicUrl(key);

    return NextResponse.json({ uploadUrl, key, publicUrl });
  } catch (error) {
    console.error("Upload URL generation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
