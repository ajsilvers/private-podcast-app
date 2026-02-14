"use client";

import { useState, useEffect, use, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EpisodeForm } from "@/components/forms/episode-form";
import { ShowForm } from "@/components/forms/show-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Show {
  id: string;
  title: string;
  description: string | null;
  authorName: string;
  authorEmail: string;
  coverArtUrl: string | null;
  feedType: string;
  dripIntervalDays: number | null;
  episodes: Episode[];
}

interface Episode {
  id: string;
  title: string;
  description: string | null;
  episodeNumber: number;
  durationSeconds: number;
  audioUrl: string;
  imageUrl: string | null;
  fileSizeBytes: number;
  seasonNumber: number | null;
  isPublished: boolean;
}

interface Stats {
  totalSubscribers: number;
  activatedCount: number;
  activationRate: number;
}

interface Subscriber {
  id: string;
  email: string;
  name: string | null;
  status: string;
  activatedAt: string | null;
  startDate: string;
  feedToken: string;
}

// Season panel component
function SeasonPanel({
  title,
  episodes,
  showCoverArt,
  feedType,
  dripIntervalDays,
  totalSubscribers,
  subscribers,
  onEdit,
  onDelete,
  onMoveEpisode,
}: {
  title: string;
  episodes: Episode[];
  showCoverArt: string | null;
  feedType: string;
  dripIntervalDays: number | null;
  totalSubscribers: number;
  subscribers: Subscriber[];
  onEdit: (episode: Episode) => void;
  onDelete: (id: string) => void;
  onMoveEpisode: (episodeId: string, direction: "up" | "down") => void;
}) {
  // Calculate subscriber access for each episode
  const getAccessCount = (episode: Episode): number => {
    if (feedType === "BINGE") {
      return totalSubscribers;
    }

    // DRIP feed: count subscribers who started early enough
    const interval = dripIntervalDays || 1;
    const daysRequired = (episode.episodeNumber - 1) * interval;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysRequired);
    cutoffDate.setHours(0, 0, 0, 0);

    return subscribers.filter((sub) => {
      if (sub.status !== "ACTIVE") return false;
      const subDate = new Date(sub.startDate);
      subDate.setHours(0, 0, 0, 0);
      return subDate <= cutoffDate;
    }).length;
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="bg-gray-50 px-4 py-3 border-b">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500">{episodes.length} episode{episodes.length !== 1 ? "s" : ""}</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead>Title</TableHead>
            <TableHead className="w-24">Duration</TableHead>
            <TableHead className="w-28">Status</TableHead>
            <TableHead className="w-24 text-center">Access</TableHead>
            <TableHead className="w-40">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {episodes.map((episode, index) => {
            // Determine if episode can be moved
            const canMoveUp = index > 0 && canReorder(episode, episodes[index - 1], feedType);
            const canMoveDown = index < episodes.length - 1 && canReorder(episode, episodes[index + 1], feedType);
            
            return (
              <TableRow key={episode.id}>
                <TableCell className="font-medium">{episode.episodeNumber}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    {episode.imageUrl ? (
                      <img
                        src={episode.imageUrl}
                        alt={episode.title}
                        className="w-10 h-10 object-cover rounded"
                      />
                    ) : showCoverArt ? (
                      <img
                        src={showCoverArt}
                        alt={episode.title}
                        className="w-10 h-10 object-cover rounded opacity-50"
                      />
                    ) : null}
                    <span>{episode.title}</span>
                  </div>
                </TableCell>
                <TableCell>{formatDuration(episode.durationSeconds)}</TableCell>
                <TableCell>
                  <Badge variant={episode.isPublished ? "default" : "secondary"}>
                    {episode.isPublished ? "Published" : "Draft"}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">
                  <span className="text-sm font-medium">{getAccessCount(episode)}</span>
                  <span className="text-xs text-gray-400">/{totalSubscribers}</span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {/* Move buttons */}
                    <div className="flex flex-col">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1"
                        disabled={!canMoveUp}
                        onClick={() => onMoveEpisode(episode.id, "up")}
                        title={canMoveUp ? "Move up" : "Cannot move"}
                      >
                        ↑
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1"
                        disabled={!canMoveDown}
                        onClick={() => onMoveEpisode(episode.id, "down")}
                        title={canMoveDown ? "Move down" : "Cannot move"}
                      >
                        ↓
                      </Button>
                    </div>
                    <div className="flex gap-1 ml-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onEdit(episode)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => onDelete(episode.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// Helper function to determine if an episode can be reordered
function canReorder(episode: Episode, adjacentEpisode: Episode, feedType: string): boolean {
  if (feedType === "BINGE") {
    // For binge feeds, any published episode can be moved
    return true;
  }
  
  // For drip feeds, only draft episodes can be moved
  // A published episode cannot be moved
  if (episode.isPublished) {
    return false;
  }
  
  // Draft episodes can only be moved relative to other drafts
  // (they can't swap positions with published episodes)
  return !adjacentEpisode.isPublished;
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function ShowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [show, setShow] = useState<Show | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [episodeDialog, setEpisodeDialog] = useState(false);
  const [editingEpisode, setEditingEpisode] = useState<Episode | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [subscriberDialog, setSubscriberDialog] = useState(false);
  const [newSubscriberEmail, setNewSubscriberEmail] = useState("");
  const [newSubscriberName, setNewSubscriberName] = useState("");
  const [newSubscriberStartDate, setNewSubscriberStartDate] = useState<Date | undefined>(undefined);
  const [feedUrl, setFeedUrl] = useState<string | null>(null);

  useEffect(() => {
    loadShow();
    loadSubscribers();
  }, [resolvedParams.id]);

  async function loadShow() {
    try {
      const res = await fetch(`/api/shows/${resolvedParams.id}`);
      if (res.ok) {
        const data = await res.json();
        setShow(data.show);
        setStats(data.stats);
      }
    } catch (error) {
      console.error("Error loading show:", error);
    } finally {
      setLoading(false);
    }
  }

  async function loadSubscribers() {
    try {
      const res = await fetch(`/api/shows/${resolvedParams.id}/subscribers`);
      if (res.ok) {
        const data = await res.json();
        setSubscribers(data.subscribers);
      }
    } catch (error) {
      console.error("Error loading subscribers:", error);
    }
  }

  // Group episodes by season
  const episodesBySeason = useMemo(() => {
    if (!show) return { unsorted: [], seasons: {} };

    const unsorted: Episode[] = [];
    const seasons: Record<number, Episode[]> = {};

    show.episodes.forEach((episode) => {
      if (episode.seasonNumber === null) {
        unsorted.push(episode);
      } else {
        if (!seasons[episode.seasonNumber]) {
          seasons[episode.seasonNumber] = [];
        }
        seasons[episode.seasonNumber].push(episode);
      }
    });

    // Sort episodes within each season
    unsorted.sort((a, b) => a.episodeNumber - b.episodeNumber);
    Object.keys(seasons).forEach((season) => {
      seasons[parseInt(season)].sort((a, b) => a.episodeNumber - b.episodeNumber);
    });

    return { unsorted, seasons };
  }, [show]);

  // Get sorted season numbers
  const sortedSeasonNumbers = useMemo(() => {
    return Object.keys(episodesBySeason.seasons)
      .map(Number)
      .sort((a, b) => a - b);
  }, [episodesBySeason]);

  async function handleEpisodeSubmit(data: Record<string, unknown>) {
    const url = editingEpisode
      ? `/api/episodes/${editingEpisode.id}`
      : `/api/shows/${resolvedParams.id}/episodes`;
    const method = editingEpisode ? "PATCH" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        setEpisodeDialog(false);
        setEditingEpisode(null);
        loadShow();
      } else {
        const errorData = await res.json();
        console.error("Episode save error:", errorData);
        const errorMsg = typeof errorData.error === 'string'
          ? errorData.error
          : errorData.details || JSON.stringify(errorData.error);
        alert(errorMsg || "Failed to save episode");
      }
    } catch (error) {
      console.error("Error:", error);
      alert("Failed to save episode: " + String(error));
    }
  }

  async function handleDeleteEpisode(episodeId: string) {
    try {
      const res = await fetch(`/api/episodes/${episodeId}`, { method: "DELETE" });
      if (res.ok) {
        loadShow();
      }
    } catch (error) {
      console.error("Error deleting episode:", error);
    }
  }

  async function handleMoveEpisode(episodeId: string, direction: "up" | "down") {
    if (!show) return;

    const episodes = [...show.episodes].sort((a, b) => a.episodeNumber - b.episodeNumber);
    const episodeIndex = episodes.findIndex((ep) => ep.id === episodeId);
    
    if (episodeIndex === -1) return;
    
    const swapIndex = direction === "up" ? episodeIndex - 1 : episodeIndex + 1;
    if (swapIndex < 0 || swapIndex >= episodes.length) return;

    const episode1 = episodes[episodeIndex];
    const episode2 = episodes[swapIndex];

    // Swap episode numbers
    try {
      await Promise.all([
        fetch(`/api/episodes/${episode1.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...episode1, episodeNumber: episode2.episodeNumber }),
        }),
        fetch(`/api/episodes/${episode2.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...episode2, episodeNumber: episode1.episodeNumber }),
        }),
      ]);
      
      loadShow();
    } catch (error) {
      console.error("Error moving episode:", error);
    }
  }

  async function handleShowSubmit(data: Record<string, unknown>) {
    try {
      const res = await fetch(`/api/shows/${resolvedParams.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        setShowDialog(false);
        loadShow();
      } else {
        const errorData = await res.json();
        const errorMsg = typeof errorData.error === 'string'
          ? errorData.error
          : JSON.stringify(errorData.error);
        alert(errorMsg || "Failed to update show");
      }
    } catch (error) {
      console.error("Error:", error);
      alert("Failed to update show");
    }
  }

  async function handleAddSubscriber(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch(`/api/shows/${resolvedParams.id}/subscribers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email: newSubscriberEmail, 
          name: newSubscriberName,
          startDate: newSubscriberStartDate?.toISOString(),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setFeedUrl(data.feedUrl);
        setNewSubscriberEmail("");
        setNewSubscriberName("");
        setNewSubscriberStartDate(undefined);
        loadSubscribers();
        loadShow();
      } else {
        const error = await res.json();
        alert(error.error || "Failed to add subscriber");
      }
    } catch (error) {
      console.error("Error:", error);
    }
  }

  async function handleRevokeSubscriber(subscriberId: string) {
    try {
      await fetch(`/api/subscribers/${subscriberId}/revoke`, { method: "POST" });
      loadSubscribers();
    } catch (error) {
      console.error("Error revoking subscriber:", error);
    }
  }

  async function handleReactivateSubscriber(subscriberId: string) {
    try {
      await fetch(`/api/subscribers/${subscriberId}/reactivate`, { method: "POST" });
      loadSubscribers();
    } catch (error) {
      console.error("Error reactivating subscriber:", error);
    }
  }

  function copyFeedUrl(token: string) {
    const url = `${window.location.origin}/api/feeds/${token}`;
    navigator.clipboard.writeText(url);
    alert("Feed URL copied!");
  }

  if (loading) return <div>Loading...</div>;
  if (!show) return <div>Show not found</div>;

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div className="flex gap-4">
          {show.coverArtUrl && (
            <img
              src={show.coverArtUrl}
              alt={show.title}
              className="w-24 h-24 object-cover rounded-lg"
            />
          )}
          <div>
            <h1 className="text-2xl font-bold">{show.title}</h1>
            <div className="flex gap-2 mt-2">
              <Badge variant={show.feedType === "BINGE" ? "default" : "secondary"}>
                {show.feedType === "BINGE" ? "Binge" : `Drip (${show.dripIntervalDays || 1}d)`}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowDialog(true)}>
            Edit Show
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Delete Show</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Show</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete this show and all its episodes and subscribers. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    await fetch(`/api/shows/${show.id}`, { method: "DELETE" });
                    router.push("/shows");
                  }}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Subscribers</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stats.totalSubscribers}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Activated</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stats.activatedCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Activation Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stats.activationRate}%</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="episodes">
        <TabsList>
          <TabsTrigger value="episodes">Episodes ({show.episodes.length})</TabsTrigger>
          <TabsTrigger value="subscribers">Subscribers ({subscribers.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="episodes" className="mt-4">
          <div className="flex justify-end mb-4">
            <Button
              onClick={() => {
                setEditingEpisode(null);
                setEpisodeDialog(true);
              }}
            >
              Add Episode
            </Button>
          </div>

          {show.episodes.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-gray-500">
                No episodes yet. Add your first episode!
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Episodes without season */}
              {episodesBySeason.unsorted.length > 0 && (
                <SeasonPanel
                  title="Episodes"
                  episodes={episodesBySeason.unsorted}
                  showCoverArt={show.coverArtUrl}
                  feedType={show.feedType}
                  dripIntervalDays={show.dripIntervalDays}
                  totalSubscribers={stats?.totalSubscribers || 0}
                  subscribers={subscribers}
                  onEdit={(ep) => {
                    setEditingEpisode(ep);
                    setEpisodeDialog(true);
                  }}
                  onDelete={handleDeleteEpisode}
                  onMoveEpisode={handleMoveEpisode}
                />
              )}

              {/* Episodes by season */}
              {sortedSeasonNumbers.map((seasonNum) => (
                <SeasonPanel
                  key={seasonNum}
                  title={`Season ${seasonNum}`}
                  episodes={episodesBySeason.seasons[seasonNum]}
                  showCoverArt={show.coverArtUrl}
                  feedType={show.feedType}
                  dripIntervalDays={show.dripIntervalDays}
                  totalSubscribers={stats?.totalSubscribers || 0}
                  subscribers={subscribers}
                  onEdit={(ep) => {
                    setEditingEpisode(ep);
                    setEpisodeDialog(true);
                  }}
                  onDelete={handleDeleteEpisode}
                  onMoveEpisode={handleMoveEpisode}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="subscribers" className="mt-4">
          <div className="flex justify-end mb-4">
            <Button onClick={() => setSubscriberDialog(true)}>Add Subscriber</Button>
          </div>

          {subscribers.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-gray-500">
                No subscribers yet. Add your first subscriber!
              </CardContent>
            </Card>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Activated</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscribers.map((sub) => (
                  <TableRow key={sub.id}>
                    <TableCell>{sub.email}</TableCell>
                    <TableCell>{sub.name || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={sub.status === "ACTIVE" ? "default" : "destructive"}>
                        {sub.status === "ACTIVE" ? "Active" : "Revoked"}
                      </Badge>
                    </TableCell>
                    <TableCell>{sub.activatedAt ? "✓" : "-"}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => copyFeedUrl(sub.feedToken)}>
                          Copy Feed URL
                        </Button>
                        {sub.status === "ACTIVE" ? (
                          <Button variant="destructive" size="sm" onClick={() => handleRevokeSubscriber(sub.id)}>
                            Revoke
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => handleReactivateSubscriber(sub.id)}>
                            Reactivate
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>

      {/* Episode Dialog */}
      <Dialog open={episodeDialog} onOpenChange={setEpisodeDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingEpisode ? "Edit Episode" : "Add Episode"}</DialogTitle>
          </DialogHeader>
          <EpisodeForm
            showId={show.id}
            episode={editingEpisode ? {
              id: editingEpisode.id,
              title: editingEpisode.title,
              description: editingEpisode.description,
              audioUrl: editingEpisode.audioUrl,
              imageUrl: editingEpisode.imageUrl,
              durationSeconds: editingEpisode.durationSeconds,
              fileSizeBytes: editingEpisode.fileSizeBytes,
              seasonNumber: editingEpisode.seasonNumber,
              isPublished: editingEpisode.isPublished,
            } : undefined}
            onSubmit={handleEpisodeSubmit}
            onCancel={() => {
              setEpisodeDialog(false);
              setEditingEpisode(null);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Show Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Show</DialogTitle>
          </DialogHeader>
          <ShowForm
            show={show}
            onSubmit={handleShowSubmit}
            onCancel={() => setShowDialog(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Add Subscriber Dialog */}
      <Dialog open={subscriberDialog} onOpenChange={setSubscriberDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Subscriber</DialogTitle>
            <DialogDescription>
              Add a new subscriber to this show. They will receive a unique feed URL.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddSubscriber} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Email *</label>
              <input
                type="email"
                className="w-full border rounded px-3 py-2"
                value={newSubscriberEmail}
                onChange={(e) => setNewSubscriberEmail(e.target.value)}
                placeholder="subscriber@example.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                type="text"
                className="w-full border rounded px-3 py-2"
                value={newSubscriberName}
                onChange={(e) => setNewSubscriberName(e.target.value)}
                placeholder="John Doe"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Start Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="w-full border rounded px-3 py-2 text-left flex items-center justify-between hover:bg-gray-50"
                  >
                    {newSubscriberStartDate ? (
                      newSubscriberStartDate.toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })
                    ) : (
                      <span className="text-gray-400">Today (default)</span>
                    )}
                    <CalendarIcon className="h-4 w-4 text-gray-500" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={newSubscriberStartDate}
                    onSelect={setNewSubscriberStartDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <p className="text-xs text-gray-500 mt-1">
                For drip feeds, this determines when episode releases begin.
              </p>
            </div>
            <Button type="submit" className="w-full">Add Subscriber</Button>
          </form>
          {feedUrl && (
            <div className="mt-4 p-4 bg-gray-50 rounded">
              <p className="text-sm font-medium mb-2">Feed URL:</p>
              <code className="text-xs break-all">{feedUrl}</code>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => {
                  navigator.clipboard.writeText(feedUrl);
                  alert("Copied!");
                }}
              >
                Copy URL
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
