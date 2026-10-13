import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { nanoid } from "nanoid";

// Bunny Storage through its S3-compatible API (storage zone created with S3 enabled).
const client = new S3Client({
  region: process.env.STORAGE_REGION,
  endpoint: process.env.STORAGE_ENDPOINT,
  forcePathStyle: true,
  // The SDK otherwise signs a CRC32 checksum into presigned PUTs; Bunny only supports SHA-256.
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
  credentials: {
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID!,
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.STORAGE_BUCKET!;
const PUBLIC_URL = (process.env.STORAGE_PUBLIC_URL ?? "").replace(/\/+$/, "");

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
  return getSignedUrl(client, command, { expiresIn });
}

/**
 * Get the public URL for a stored file
 */
export function getPublicUrl(key: string): string {
  return `${PUBLIC_URL}/${key}`;
}

/**
 * Delete a file from storage
 */
export async function deleteFile(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  await client.send(command);
}

/**
 * Generate a unique storage key for a file
 */
export function generateStorageKey(type: "audio" | "image", extension: string): string {
  const prefix = type === "audio" ? "audio" : "images";
  return `${prefix}/${nanoid(16)}.${extension}`;
}

export { getFileExtension, getContentType } from "@/lib/r2-content-type";
