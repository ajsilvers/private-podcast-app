import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { getFeedTypeLabel, getDripIntervalLabel } from "@/lib/feed-generator";

async function getShows() {
  const user = await db.user.findFirst();
  if (!user) return [];
  
  return db.show.findMany({
    where: { userId: user.id },
    include: {
      _count: {
        select: { episodes: true, subscribers: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export default async function ShowsPage() {
  const shows = await getShows();

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Your Shows</h1>
        <Link href="/shows/new">
          <Button>Create Show</Button>
        </Link>
      </div>

      {shows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500 mb-4">No shows yet. Create your first private podcast!</p>
            <Link href="/shows/new">
              <Button>Create Your First Show</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {shows.map((show) => (
            <Link key={show.id} href={`/shows/${show.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                {show.coverArtUrl && (
                  <img
                    src={show.coverArtUrl}
                    alt={show.title}
                    className="w-full h-40 object-cover rounded-t-lg"
                  />
                )}
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">{show.title}</CardTitle>
                    <Badge variant={show.feedType === "BINGE" ? "default" : "secondary"}>
                      {getFeedTypeLabel(show.feedType)}
                    </Badge>
                  </div>
                  {show.feedType === "DRIP" && show.dripIntervalDays && (
                    <p className="text-sm text-gray-500">
                      {getDripIntervalLabel(show.dripIntervalDays)}
                    </p>
                  )}
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600 line-clamp-2 mb-4">
                    {show.description || "No description"}
                  </p>
                  <div className="flex gap-4 text-sm text-gray-500">
                    <span>{show._count.episodes} episodes</span>
                    <span>{show._count.subscribers} subscribers</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
