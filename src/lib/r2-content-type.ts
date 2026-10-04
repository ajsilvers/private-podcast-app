/**
 * Extract file extension from filename
 */
export function getFileExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "bin";
}

/**
 * Get content type from file extension
 */
export function getContentType(filename: string): string {
  const ext = getFileExtension(filename);
  const contentTypes: Record<string, string> = {
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
  };
  return contentTypes[ext] ?? "application/octet-stream";
}
