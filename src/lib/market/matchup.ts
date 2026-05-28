export interface MatchParticipantLike {
  name: string;
  short_name?: string | null;
  code?: string | null;
  image_url?: string | null;
  score?: number | null;
}

export interface MatchupLike {
  sport_slug: string;
  competition_name?: string | null;
  round_name?: string | null;
  fixture_id?: string | null;
  status: string;
  home: MatchParticipantLike;
  away: MatchParticipantLike;
}

const MATCH_STATUSES_WITH_VISIBLE_ZERO_ZERO_SCORE = new Set([
  "live",
  "final",
  "delayed",
  "suspended",
]);

export function getMatchParticipantLabel(participant: MatchParticipantLike): string {
  return participant.short_name?.trim() || participant.name.trim();
}

export function getMatchParticipantCode(participant: MatchParticipantLike): string | null {
  const code = participant.code?.trim();
  return code ? code.toUpperCase() : null;
}

export function formatMatchStatusLabel(status: string | null | undefined): string {
  const normalized = status?.trim().toLowerCase();

  switch (normalized) {
    case "scheduled":
      return "Scheduled";
    case "live":
      return "Live";
    case "final":
      return "Final";
    case "postponed":
      return "Postponed";
    case "cancelled":
      return "Cancelled";
    case "delayed":
      return "Delayed";
    case "suspended":
      return "Suspended";
    default:
      return normalized
        ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
        : "Status";
  }
}

export function formatMatchKickoffLabel(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatMatchupMetaLine(
  matchup: MatchupLike | null | undefined,
  startsAt?: string | null,
): string | null {
  if (!matchup) {
    return formatMatchKickoffLabel(startsAt);
  }

  const parts = [
    matchup.competition_name?.trim(),
    matchup.round_name?.trim(),
    formatMatchKickoffLabel(startsAt),
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" • ") : null;
}

export function hasMatchScore(matchup: MatchupLike | null | undefined): boolean {
  if (!matchup) {
    return false;
  }

  const homeHasScore = typeof matchup.home.score === "number";
  const awayHasScore = typeof matchup.away.score === "number";

  if (!homeHasScore && !awayHasScore) {
    return false;
  }

  const homeScore = homeHasScore ? matchup.home.score ?? 0 : 0;
  const awayScore = awayHasScore ? matchup.away.score ?? 0 : 0;

  if (homeScore !== 0 || awayScore !== 0) {
    return true;
  }

  return MATCH_STATUSES_WITH_VISIBLE_ZERO_ZERO_SCORE.has(matchup.status.trim().toLowerCase());
}

export function formatMatchScore(matchup: MatchupLike | null | undefined): string | null {
  if (!matchup || !hasMatchScore(matchup)) {
    return null;
  }

  return `${matchup.home.score ?? 0} - ${matchup.away.score ?? 0}`;
}
