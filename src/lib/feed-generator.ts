import type { Show, Episode, Subscriber, FeedType } from "@prisma/client";
import { episodeReleaseAt, isReleased } from "@/lib/release-schedule";

type ShowWithEpisodes = Show & { episodes: Episode[] };

/**
 * Generate RSS feed for a subscriber
 */
export function generateFeed(
  show: ShowWithEpisodes,
  subscriber: Subscriber,
  baseUrl: string,
  now: Date = new Date()
): string {
  const items = show.episodes
    .filter((ep) => ep.isPublished)
    .filter(() => now.getTime() >= subscriber.startDate.getTime())
    .filter((ep) => isReleased(ep, show, subscriber.startDate, now))
    .sort((a, b) => a.episodeNumber - b.episodeNumber)
    .map((ep) => generateItemXml(ep, show, subscriber, pubDateFor(ep, show, subscriber)));

  return generateChannelXml(show, items.join("\n"), baseUrl);
}

function pubDateFor(ep: Episode, show: Show, sub: Subscriber): Date {
  if (show.feedType === "BINGE") return ep.publishedAt ?? ep.createdAt;
  return episodeReleaseAt(ep, show, sub.startDate)!; // non-null: only released episodes reach here
}

function cdata(s: string): string {
  return `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

/**
 * Generate the RSS channel (show) XML
 */
function generateChannelXml(show: Show, itemsXml: string, baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(show.title)}</title>
    <link>${escapeXml(baseUrl)}</link>
    <description>${cdata(show.description ?? "")}</description>
    <language>en</language>
    <itunes:author>${escapeXml(show.authorName)}</itunes:author>
    <itunes:owner>
      <itunes:name>${escapeXml(show.authorName)}</itunes:name>
      <itunes:email>${escapeXml(show.authorEmail)}</itunes:email>
    </itunes:owner>
    ${show.coverArtUrl ? `<itunes:image href="${escapeXml(show.coverArtUrl)}"/>` : ""}
    <itunes:explicit>false</itunes:explicit>
    <itunes:type>serial</itunes:type>
${itemsXml}
  </channel>
</rss>`;
}

/**
 * Generate RSS item (episode) XML
 */
function generateItemXml(episode: Episode, show: Show, subscriber: Subscriber, pubDate: Date): string {
  const episodeImage = episode.imageUrl || show.coverArtUrl;

  return `    <item>
      <title>${escapeXml(episode.title)}</title>
      <description>${cdata(episode.description ?? "")}</description>
      <enclosure url="${escapeXml(episode.audioUrl)}" length="${episode.fileSizeBytes}" type="audio/mpeg"/>
      <guid isPermaLink="false">${escapeXml(`${subscriber.feedToken}-${episode.id}`)}</guid>
      <pubDate>${pubDate.toUTCString()}</pubDate>
      <itunes:duration>${formatDuration(episode.durationSeconds)}</itunes:duration>
      <itunes:episode>${episode.episodeNumber}</itunes:episode>
      ${episode.seasonNumber ? `<itunes:season>${episode.seasonNumber}</itunes:season>` : ""}
      ${episodeImage ? `<itunes:image href="${escapeXml(episodeImage)}"/>` : ""}
    </item>`;
}

/**
 * Escape special characters for XML
 */
export function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Format duration as iTunes duration (MM:SS or H:MM:SS)
 */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Get feed type display label
 */
export function getFeedTypeLabel(feedType: FeedType): string {
  switch (feedType) {
    case "BINGE":
      return "Binge";
    case "DRIP":
      return "Drip";
    case "DATED":
      return "Dated";
    default:
      return feedType;
  }
}

/**
 * Get drip interval display label
 */
export function getDripIntervalLabel(days: number | null): string {
  if (!days) return "";
  switch (days) {
    case 1:
      return "Daily";
    case 2:
      return "Every 2 days";
    case 3:
      return "Every 3 days";
    case 7:
      return "Weekly";
    default:
      return `Every ${days} days`;
  }
}
