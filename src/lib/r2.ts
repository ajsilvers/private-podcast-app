import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { nanoid } from "nanoid";

// Configure R2 client (S3-compatible)
const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET!;
const PUBLIC_URL = process.env.R2_PUBLIC_URL!;

/**
 * Generate a presigned URL for uploading a file
 */
export async function getUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 900 // 15 minutes
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(r2, command, { expiresIn });
}

/**
 * Get the public URL for a stored file
 */
export function getPublicUrl(key: string): string {
  return `${PUBLIC_URL}/${key}`;
}

/**
 * Delete a file from R2
 */
export async function deleteFile(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  await r2.send(command);
}

/**
 * Generate a unique storage key for a file
 */
export function generateStorageKey(type: "audio" | "image", extension: string): string {
  const prefix = type === "audio" ? "audio" : "images";
  return `${prefix}/${nanoid(16)}.${extension}`;
}

export { getFileExtension, getContentType } from "@/lib/r2-content-type";
