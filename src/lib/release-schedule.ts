export type ScheduleSettings = { feedType: "BINGE" | "DRIP" | "DATED"; dripIntervalDays: number | null };
export type SchedulableEpisode = { episodeNumber: number; releaseAt: Date | null };

const DAY = 86_400_000;

/** UTC instant the episode becomes visible for this subscriber; null = never (DATED without a date). */
export function episodeReleaseAt(ep: SchedulableEpisode, s: ScheduleSettings, startDate: Date): Date | null {
  switch (s.feedType) {
    case "BINGE":
      return startDate;
    case "DRIP":
      return new Date(startDate.getTime() + (ep.episodeNumber - 1) * (s.dripIntervalDays ?? 1) * DAY);
    case "DATED":
      return ep.releaseAt;
  }
}

export function isReleased(ep: SchedulableEpisode, s: ScheduleSettings, startDate: Date, now: Date): boolean {
  const at = episodeReleaseAt(ep, s, startDate);
  return at !== null && now.getTime() >= at.getTime();
}
