"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Show {
  id: string;
  title: string;
  description: string | null;
  coverArtUrl: string | null;
  authorName: string;
  authorEmail: string;
  feedType: string;
  dripIntervalDays: number | null;
  _count?: { episodes: number; subscribers: number };
}

interface ShowFormProps {
  show?: Show;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  onCancel?: () => void;
}

export function ShowForm({ show, onSubmit, onCancel }: ShowFormProps) {
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [coverArtUrl, setCoverArtUrl] = useState(show?.coverArtUrl || "");
  const [formData, setFormData] = useState({
    title: show?.title || "",
    description: show?.description || "",
    authorName: show?.authorName || "",
    authorEmail: show?.authorEmail || "",
    feedType: show?.feedType || "DRIP",
    dripIntervalDays: show?.dripIntervalDays || 1,
  });

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, type: "image" }),
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

      setCoverArtUrl(publicUrl);
    } catch (error) {
      console.error("Upload error:", error);
      alert(`Failed to upload image: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await onSubmit({ ...formData, coverArtUrl: coverArtUrl || null });
    setLoading(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{show ? "Edit Show" : "Create New Show"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Show Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              className="flex min-h-[80px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>Cover Art (3000x3000px recommended)</Label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
              {coverArtUrl ? (
                <div className="space-y-2">
                  <img 
                    src={coverArtUrl} 
                    alt="Cover art preview" 
                    className="w-32 h-32 object-cover rounded mx-auto"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCoverArtUrl("")}
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
                    disabled={uploading}
                  />
                  {uploading && (
                    <p className="text-sm text-gray-500 mt-2">Uploading...</p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="authorName">Author Name *</Label>
              <Input
                id="authorName"
                value={formData.authorName}
                onChange={(e) => setFormData({ ...formData, authorName: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="authorEmail">Author Email *</Label>
              <Input
                id="authorEmail"
                type="email"
                value={formData.authorEmail}
                onChange={(e) => setFormData({ ...formData, authorEmail: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedType">Feed Type *</Label>
            <select
              id="feedType"
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              value={formData.feedType}
              onChange={(e) => setFormData({ ...formData, feedType: e.target.value })}
            >
              <option value="BINGE">Binge - All episodes available immediately</option>
              <option value="DRIP">Drip - Episodes release on schedule</option>
            </select>
          </div>

          {formData.feedType === "DRIP" && (
            <div className="space-y-2">
              <Label htmlFor="dripInterval">Drip Interval</Label>
              <select
                id="dripInterval"
                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                value={formData.dripIntervalDays}
                onChange={(e) => setFormData({ ...formData, dripIntervalDays: parseInt(e.target.value) })}
              >
                <option value={1}>Daily</option>
                <option value={2}>Every 2 days</option>
                <option value={3}>Every 3 days</option>
                <option value={7}>Weekly</option>
              </select>
            </div>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={loading || uploading}>
              {loading ? "Saving..." : show ? "Update Show" : "Create Show"}
            </Button>
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
