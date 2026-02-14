"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface EpisodeFormProps {
  showId: string;
  episode?: {
    id: string;
    title: string;
    description: string | null;
    audioUrl: string;
    imageUrl: string | null;
    durationSeconds: number;
    fileSizeBytes: number;
    seasonNumber: number | null;
    isPublished: boolean;
  };
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}

async function uploadFile(
  file: File,
  type: "audio" | "image"
): Promise<{ publicUrl: string }> {
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, type }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || "Failed to get upload URL");
  }

  const { uploadUrl, publicUrl } = await res.json();

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });

  if (!uploadRes.ok) {
    throw new Error(`Upload failed: ${uploadRes.status}`);
  }

  return { publicUrl };
}

export function EpisodeForm({ showId, episode, onSubmit, onCancel }: EpisodeFormProps) {
  const [loading, setLoading] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [audioUrl, setAudioUrl] = useState(episode?.audioUrl || "");
  const [duration, setDuration] = useState(episode?.durationSeconds || 0);
  const [fileSize, setFileSize] = useState(episode?.fileSizeBytes || 0);
  const [imageUrl, setImageUrl] = useState(episode?.imageUrl || "");

  const [formData, setFormData] = useState({
    title: episode?.title || "",
    description: episode?.description || "",
    seasonNumber: episode?.seasonNumber || null,
    isPublished: episode?.isPublished || false,
  });

  async function handleAudioUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAudio(true);

    try {
      const { publicUrl } = await uploadFile(file, "audio");
      setAudioUrl(publicUrl);
      setFileSize(file.size);

      // Get duration from audio file
      const audio = new Audio();
      audio.src = URL.createObjectURL(file);
      audio.onloadedmetadata = () => {
        setDuration(Math.floor(audio.duration));
        URL.revokeObjectURL(audio.src);
      };
    } catch (error) {
      console.error("Audio upload error:", error);
      alert(`Failed to upload audio: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setUploadingAudio(false);
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);

    try {
      const { publicUrl } = await uploadFile(file, "image");
      setImageUrl(publicUrl);
    } catch (error) {
      console.error("Image upload error:", error);
      alert(`Failed to upload image: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!audioUrl) {
      alert("Please upload an audio file");
      return;
    }

    const submitData = {
      ...formData,
      audioUrl,
      imageUrl: imageUrl || undefined,
      durationSeconds: duration,
      fileSizeBytes: fileSize,
    };
    
    console.log("Submitting episode data:", submitData);
    
    setLoading(true);
    await onSubmit(submitData);
    setLoading(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{episode ? "Edit Episode" : "Add New Episode"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Episode Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description / Show Notes</Label>
            <textarea
              id="description"
              className="flex min-h-[100px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>Audio File *</Label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
              {audioUrl ? (
                <div className="space-y-2">
                  <p className="text-sm text-green-600">✓ Audio uploaded</p>
                  <audio src={audioUrl} controls className="w-full" />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAudioUrl("")}
                  >
                    Replace Audio
                  </Button>
                </div>
              ) : (
                <div>
                  <Input
                    type="file"
                    accept="audio/*"
                    onChange={handleAudioUpload}
                    disabled={uploadingAudio}
                  />
                  {uploadingAudio && (
                    <p className="text-sm text-gray-500 mt-2">Uploading audio...</p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Episode Artwork (optional)</Label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
              {imageUrl ? (
                <div className="space-y-2">
                  <img
                    src={imageUrl}
                    alt="Episode artwork preview"
                    className="w-32 h-32 object-cover rounded mx-auto"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setImageUrl("")}
                  >
                    Remove Image
                  </Button>
                </div>
              ) : (
                <div>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    disabled={uploadingImage}
                  />
                  {uploadingImage && (
                    <p className="text-sm text-gray-500 mt-2">Uploading image...</p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="seasonNumber">Season Number (optional)</Label>
              <Input
                id="seasonNumber"
                type="number"
                min="1"
                value={formData.seasonNumber || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    seasonNumber: e.target.value ? parseInt(e.target.value) : null,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="isPublished">Status</Label>
              <select
                id="isPublished"
                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                value={formData.isPublished ? "published" : "draft"}
                onChange={(e) =>
                  setFormData({ ...formData, isPublished: e.target.value === "published" })
                }
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={loading || uploadingAudio || uploadingImage}>
              {loading ? "Saving..." : episode ? "Update Episode" : "Add Episode"}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
