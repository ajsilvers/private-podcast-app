import { format, addDays, subDays, isBefore, startOfDay, isSameDay } from "date-fns";
import type { Show, Episode, Subscriber, FeedType } from "@prisma/client";

type ShowWithEpisodes = Show & { episodes: Episode[] };

/**
 * Generate RSS feed for a subscriber
 */
export function generateFeed(
  show: ShowWithEpisodes,
  subscriber: Subscriber,
  baseUrl: string
): string {
  const now = new Date();
  const publishedEpisodes = show.episodes
    .filter((ep) => ep.isPublished)
    .sort((a, b) => a.episodeNumber - b.episodeNumber);

  const visibleEpisodes = publishedEpisodes.filter((ep) =>
    isEpisodeVisible(ep, show, subscriber, now)
  );

  const items = visibleEpisodes.map((ep) =>
    generateItemXml(ep, show, subscriber, baseUrl)
  );

  return generateChannelXml(show, items.join("\n"), baseUrl);
}

/**
 * Determine if an episode should be visible in a subscriber's feed
 */
export function isEpisodeVisible(
  episode: Episode,
  show: Show,
  subscriber: Subscriber,
  now: Date
): boolean {
  switch (show.feedType) {
    case "BINGE":
      // All published episodes immediately visible
      return true;

    case "DRIP": {
      // Episode N visible if: now >= startDate + ((N-1) * interval)
      const intervalDays = show.dripIntervalDays ?? 1;
      const daysUntilRelease = (episode.episodeNumber - 1) * intervalDays;
      const releaseDate = addDays(startOfDay(subscriber.startDate), daysUntilRelease);
      const today = startOfDay(now);
      return isBefore(releaseDate, today) || isSameDay(releaseDate, today);
    }

    default:
      return false;
  }
}

/**
 * Calculate publication date for an episode based on feed type
 */
export function calculatePubDate(
  episode: Episode,
  show: ShowWithEpisodes,
  subscriber: Subscriber
): Date {
  switch (show.feedType) {
    case "BINGE": {
      // Episodes dated backwards from start date
      // Episode 1 = oldest, last episode = start date
      const totalEpisodes = show.episodes.filter((e) => e.isPublished).length;
      const daysBack = totalEpisodes - episode.episodeNumber;
      return subDays(startOfDay(subscriber.startDate), daysBack);
    }

    case "DRIP": {
      const intervalDays = show.dripIntervalDays ?? 1;
      const daysAfterStart = (episode.episodeNumber - 1) * intervalDays;
      return addDays(startOfDay(subscriber.startDate), daysAfterStart);
    }

    default:
      return episode.createdAt;
  }
}

/**
 * Generate the RSS channel (show) XML
 */
function generateChannelXml(
  show: Show,
  itemsXml: string,
  baseUrl: string
): string {
  const feedTypeLabel = show.feedType === "BINGE" ? "complete" : "episodic";
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" 
     xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
     xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(show.title)}</title>
    <description>${escapeXml(show.description ?? "")}</description>
    <language>en-us</language>
    <itunes:author>${escapeXml(show.authorName)}</itunes:author>
    <itunes:owner>
      <itunes:name>${escapeXml(show.authorName)}</itunes:name>
      <itunes:email>${escapeXml(show.authorEmail)}</itunes:email>
    </itunes:owner>
    ${show.coverArtUrl ? `<itunes:image href="${escapeXml(show.coverArtUrl)}"/>` : ""}
    <itunes:explicit>false</itunes:explicit>
    <itunes:type>${feedTypeLabel}</itunes:type>
${itemsXml}
  </channel>
</rss>`;
}

/**
 * Generate RSS item (episode) XML
 */
function generateItemXml(
  episode: Episode,
  show: ShowWithEpisodes,
  subscriber: Subscriber,
  baseUrl: string
): string {
  const pubDate = calculatePubDate(episode, show, subscriber);
  const guid = `${subscriber.feedToken}-${episode.id}`;
  const episodeImage = episode.imageUrl || show.coverArtUrl;

  return `    <item>
      <title>${escapeXml(episode.title)}</title>
      <description><![CDATA[${episode.description ?? ""}]]></description>
      <enclosure url="${episode.audioUrl}" 
                 length="${episode.fileSizeBytes}" 
                 type="audio/mpeg"/>
      <guid isPermaLink="false">${guid}</guid>
      <pubDate>${formatRfc2822(pubDate)}</pubDate>
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
 * Format date as RFC 2822 for RSS pubDate
 */
export function formatRfc2822(date: Date): string {
  return format(date, "EEE, dd MMM yyyy HH:mm:ss xx");
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
