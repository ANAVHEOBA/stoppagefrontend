import { A } from "@solidjs/router";
import { For, Show } from "solid-js";

import {
  formatProbabilityFromBps,
  formatUsdVolume,
} from "~/components/market-detail/format.ts";
import {
  getMarketDisplayLabel,
  type GroupedMarketEvent,
  type PublicMarketCardResponse,
} from "~/lib/market/index.ts";
import { normalizeOptionalMediaUrl } from "~/lib/media";
import {
  formatMatchKickoffLabel,
  getMatchParticipantCode,
  getMatchParticipantLabel,
  hasMatchScore,
} from "~/lib/market/matchup.ts";
import type {
  EventMatchParticipantResponse,
  MarketMetadataResponse,
  PublicMarketCardResponse as PublicMarketCardResponseType,
} from "~/lib/market/types.ts";

const EVENT_PRIMARY_MARKET_STORAGE_PREFIX = "pm-event-primary-market/v1:";

function buildEventHref(eventSlug: string): string {
  return `/event/${encodeURIComponent(eventSlug)}`;
}

function rememberPreferredMarket(eventSlug: string, marketSlug: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      `${EVENT_PRIMARY_MARKET_STORAGE_PREFIX}${eventSlug}`,
      JSON.stringify(marketSlug),
    );
  } catch {
    // Ignore storage failures and fall back to plain navigation.
  }
}

function formatCategoryLabel(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map(token => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function formatNextEndTime(value: string | null): string {
  if (!value) {
    return "TBD";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "TBD";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function EventArtwork(props: { card: GroupedMarketEvent }) {
  const fallbackLetter = props.card.event.title.trim().charAt(0).toUpperCase() || "M";
  const eventImageUrl = () => normalizeOptionalMediaUrl(props.card.event.image_url);

  return (
    <div class="pm-market-card__art">
      <Show
        when={eventImageUrl()}
        fallback={<span class="pm-market-card__art-fallback">{fallbackLetter}</span>}
      >
        {value => (
          <img
            src={value() ?? ""}
            alt={`${props.card.event.title} card icon`}
            loading="lazy"
            decoding="async"
          />
        )}
      </Show>
    </div>
  );
}

function MatchParticipantBadge(props: { participant: EventMatchParticipantResponse }) {
  const label = () =>
    getMatchParticipantCode(props.participant) ??
    getMatchParticipantLabel(props.participant).slice(0, 3).toUpperCase();
  const imageUrl = () => normalizeOptionalMediaUrl(props.participant.image_url);

  return (
    <div class="pm-match-badge" aria-hidden="true">
      <Show
        when={imageUrl()}
        fallback={<span class="pm-match-badge__fallback">{label()}</span>}
      >
        <img src={imageUrl() ?? ""} alt="" loading="lazy" decoding="async" />
      </Show>
    </div>
  );
}

function MatchParticipantRow(props: {
  participant: EventMatchParticipantResponse;
  showScore: boolean;
  metric: string;
}) {
  return (
    <div class="pm-sport-card__team-row pm-sport-card__team-row--wide">
      <div class="pm-sport-card__team">
        <MatchParticipantBadge participant={props.participant} />
        <Show when={props.showScore}>
          <span class="pm-sport-card__team-score">{props.participant.score ?? 0}</span>
        </Show>
        <span class="pm-sport-card__team-name">{getMatchParticipantLabel(props.participant)}</span>
      </div>

      <span class="pm-sport-card__team-metric">{props.metric}</span>
    </div>
  );
}

interface MatchResultMarketGroup<TMarket> {
  home: TMarket | null;
  draw: TMarket | null;
  away: TMarket | null;
}

function getMatchResultMarkets<TMarket extends { market_metadata?: MarketMetadataResponse | null }>(
  markets: readonly TMarket[],
): MatchResultMarketGroup<TMarket> {
  const result: MatchResultMarketGroup<TMarket> = {
    home: null,
    draw: null,
    away: null,
  };

  for (const market of markets) {
    const metadata = market.market_metadata;

    if (metadata?.market_key !== "h2h_3_way" || metadata.period_key !== "regulation") {
      continue;
    }

    if (metadata.selection_key === "home") {
      result.home = market;
      continue;
    }

    if (metadata.selection_key === "draw") {
      result.draw = market;
      continue;
    }

    if (metadata.selection_key === "away") {
      result.away = market;
    }
  }

  return result;
}

function formatSelectionProbability(market: PublicMarketCardResponseType | null): string {
  if (!market) {
    return "--";
  }

  return (
    formatProbabilityFromBps(
      market.quote_summary?.buy_yes_bps ??
        market.current_prices?.yes_bps ??
        market.last_trade_yes_bps,
    ) ?? "--"
  );
}

function formatEventVolumeSummary(markets: readonly PublicMarketCardResponse[]): string | null {
  const totalVolume = markets.reduce((sum, market) => {
    const parsed = Number.parseFloat(market.stats?.volume_usd ?? "");
    return Number.isFinite(parsed) ? sum + parsed : sum;
  }, 0);

  if (totalVolume <= 0) {
    return null;
  }

  return formatUsdVolume(totalVolume.toFixed(2), true);
}

function buildMatchActionLabel(rawLabel: string | null | undefined, fallback: string): string {
  const normalized = rawLabel?.trim();

  if (!normalized) {
    return fallback;
  }

  return normalized.replace(/\s+win$/i, "").trim() || fallback;
}

function MarketOutcomeLinks(props: {
  eventSlug: string;
  market: PublicMarketCardResponse;
}) {
  return (
    <div class="pm-market-card__actions">
      <For each={props.market.outcomes.slice(0, 2)}>
        {(outcome, index) => (
          <A
            href={buildEventHref(props.eventSlug)}
            classList={{
              "pm-market-card__outcome": true,
              "pm-market-card__outcome--yes": index() === 0,
              "pm-market-card__outcome--no": index() !== 0,
            }}
            onClick={() => rememberPreferredMarket(props.eventSlug, props.market.slug)}
          >
            {outcome}
          </A>
        )}
      </For>
    </div>
  );
}

function GroupedMarketCard(props: {
  card: GroupedMarketEvent;
  marketLimit?: number;
}) {
  const visibleMarkets = () =>
    props.card.markets.slice(0, props.marketLimit ?? props.card.markets.length);
  const matchup = () => props.card.event.matchup ?? null;
  const hasVisibleMatchScore = () => hasMatchScore(matchup());
  const matchResultMarkets = () => getMatchResultMarkets(props.card.markets);
  const matchVolumeSummary = () => formatEventVolumeSummary(props.card.markets);
  const shouldRenderSportCard = () => {
    const results = matchResultMarkets();

    return Boolean(matchup() && (results.home || results.draw || results.away));
  };
  const sportPrimaryMarketSlug = () =>
    matchResultMarkets().home?.slug ?? props.card.markets[0]?.slug ?? "";
  const sportMetaLabel = () => {
    const competitionName = matchup()?.competition_name?.trim();

    if (competitionName) {
      return competitionName;
    }

    return formatCategoryLabel(
      props.card.event.subcategory_slug ?? props.card.event.category_slug,
    );
  };

  return (
    <article
      classList={{
        "pm-market-card": true,
        "pm-market-card--match": shouldRenderSportCard(),
        "pm-market-card--sport": shouldRenderSportCard(),
      }}
    >
      <Show
        when={shouldRenderSportCard() ? matchup() : null}
        fallback={
          <>
            <div class="pm-market-card__header">
              <EventArtwork card={props.card} />

              <div class="pm-market-card__heading">
                <div class="pm-market-card__eyebrow-row">
                  <span class="pm-market-card__eyebrow">
                    {formatCategoryLabel(props.card.event.category_slug)}
                  </span>
                  <span class="pm-market-card__status">{props.card.activeMarketsCount} active</span>
                </div>

                <A
                  href={buildEventHref(props.card.event.slug)}
                  class="pm-market-card__title-link"
                  onClick={() =>
                    rememberPreferredMarket(props.card.event.slug, props.card.markets[0]?.slug ?? "")
                  }
                >
                  <h2 class="pm-market-card__title">{props.card.event.title}</h2>
                </A>

                <Show when={props.card.event.summary}>
                  <p class="pm-market-card__summary">{props.card.event.summary}</p>
                </Show>
              </div>
            </div>

            <div class="pm-market-card__markets">
              <For each={visibleMarkets()}>
                {market => {
                  const label = getMarketDisplayLabel(market);
                  const question = market.question.trim();

                  return (
                    <div class="pm-market-card__market-row">
                      <div class="pm-market-card__market-copy">
                        <A
                          href={buildEventHref(props.card.event.slug)}
                          class="pm-market-card__market-link"
                          onClick={() => rememberPreferredMarket(props.card.event.slug, market.slug)}
                        >
                          <p class="pm-market-card__market-label">{label}</p>
                        </A>

                        <Show when={question.length > 0 && question.toLowerCase() !== label.toLowerCase()}>
                          <p class="pm-market-card__market-question">{question}</p>
                        </Show>
                      </div>

                      <MarketOutcomeLinks eventSlug={props.card.event.slug} market={market} />
                    </div>
                  );
                }}
              </For>
            </div>

            <div class="pm-market-card__footer">
              <div class="pm-market-card__footer-meta">
                <span class="pm-market-card__footer-pill">{props.card.marketCount} markets</span>
                <p class="pm-market-card__footer-text">
                  Next close {formatNextEndTime(props.card.nextEndTime)}
                </p>
              </div>
            </div>
          </>
        }
      >
        {value => (
          <>
            <A
              href={buildEventHref(props.card.event.slug)}
              class="pm-sport-card__summary pm-sport-card__summary--wide"
              onClick={() => rememberPreferredMarket(props.card.event.slug, sportPrimaryMarketSlug())}
            >
              <MatchParticipantRow
                participant={value().home}
                showScore={hasVisibleMatchScore()}
                metric={formatSelectionProbability(matchResultMarkets().home)}
              />
              <MatchParticipantRow
                participant={value().away}
                showScore={hasVisibleMatchScore()}
                metric={formatSelectionProbability(matchResultMarkets().away)}
              />
            </A>

            <div class="pm-sport-card__actions pm-sport-card__actions--wide">
              <Show when={matchResultMarkets().home}>
                {market => (
                  <A
                    href={buildEventHref(props.card.event.slug)}
                    class="pm-sport-card__button pm-sport-card__button--home"
                    onClick={() => rememberPreferredMarket(props.card.event.slug, market().slug)}
                  >
                    {buildMatchActionLabel(
                      market().label,
                      getMatchParticipantLabel(value().home),
                    )}
                  </A>
                )}
              </Show>

              <Show when={matchResultMarkets().draw}>
                {market => (
                  <A
                    href={buildEventHref(props.card.event.slug)}
                    class="pm-sport-card__button pm-sport-card__button--draw"
                    onClick={() => rememberPreferredMarket(props.card.event.slug, market().slug)}
                  >
                    Draw
                  </A>
                )}
              </Show>

              <Show when={matchResultMarkets().away}>
                {market => (
                  <A
                    href={buildEventHref(props.card.event.slug)}
                    class="pm-sport-card__button pm-sport-card__button--away"
                    onClick={() => rememberPreferredMarket(props.card.event.slug, market().slug)}
                  >
                    {buildMatchActionLabel(
                      market().label,
                      getMatchParticipantLabel(value().away),
                    )}
                  </A>
                )}
              </Show>
            </div>

            <div class="pm-sport-card__footer pm-sport-card__footer--wide">
              <p class="pm-sport-card__footer-text">
                {matchVolumeSummary() ?? `${props.card.marketCount} markets`}
                <span> · </span>
                {sportMetaLabel()}
                <span> · </span>
                {formatMatchKickoffLabel(props.card.startsAt ?? props.card.nextEndTime) ?? "TBD"}
              </p>
            </div>
          </>
        )}
      </Show>
    </article>
  );
}

interface GroupedMarketCardGridProps {
  cards: readonly GroupedMarketEvent[];
  marketLimit?: number;
}

export default function GroupedMarketCardGrid(props: GroupedMarketCardGridProps) {
  return (
    <div class="pm-market-grid">
      <For each={props.cards}>
        {card => <GroupedMarketCard card={card} marketLimit={props.marketLimit} />}
      </For>
    </div>
  );
}
