import { A } from "@solidjs/router";
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";

import {
  formatProbabilityFromBps,
  formatUsdVolume,
} from "~/components/market-detail/format.ts";
import type { GroupedMarketEvent, PublicMarketCardResponse } from "~/lib/market/index.ts";
import { normalizeOptionalMediaUrl } from "~/lib/media";
import {
  formatMatchKickoffLabel,
  getMatchParticipantCode,
  getMatchParticipantLabel,
  hasMatchScore,
} from "~/lib/market/matchup.ts";
import {
  fetchEventMarketsSnapshot,
  readStoredEventMarkets,
} from "~/lib/market/event-markets-cache.ts";
import type {
  EventMatchParticipantResponse,
  MarketCurrentPricesResponse,
  MarketMetadataResponse,
  MarketQuoteSummaryResponse,
  MarketResponse,
  MarketStatsResponse,
} from "~/lib/market/types.ts";

interface PublicMarketSectionsProps {
  cards: GroupedMarketEvent[];
  title?: string;
  onRetry?: () => void;
  loading?: boolean;
  error?: string | null;
  canLoadMore?: boolean;
  loadingMore?: boolean;
  loadMoreError?: string | null;
  onLoadMore?: () => void;
}

const EVENT_PRIMARY_MARKET_STORAGE_PREFIX = "pm-event-primary-market/v1:";
const EAGER_CARD_IMAGE_COUNT = 12;
const EAGER_CARD_DATA_COUNT = 12;

function formatCategoryLabel(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map(token => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

interface HomeCardMarket {
  id: string;
  slug: string;
  label: string;
  question: string;
  outcomes: string[];
  end_time: string;
  sort_order: number;
  trading_status: string;
  current_prices?: MarketCurrentPricesResponse | null;
  stats?: MarketStatsResponse | null;
  quote_summary?: MarketQuoteSummaryResponse | null;
  last_trade_yes_bps?: number | null;
  market_metadata?: MarketMetadataResponse | null;
}

function formatRowLabel(market: HomeCardMarket): string {
  const label = market.label.trim();

  if (label.length > 0) {
    return label;
  }

  const date = new Date(market.end_time);

  if (Number.isNaN(date.getTime())) {
    return "Open market";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatMarketMetric(market: HomeCardMarket): string {
  const probability =
    formatProbabilityFromBps(market.last_trade_yes_bps) ??
    formatProbabilityFromBps(market.current_prices?.yes_bps);

  if (probability) {
    return probability;
  }

  const volume = formatUsdVolume(market.stats?.volume_usd, true);

  if (volume) {
    return volume;
  }

  return "--";
}

function compareMarkets(left: HomeCardMarket, right: HomeCardMarket): number {
  if (left.sort_order !== right.sort_order) {
    return left.sort_order - right.sort_order;
  }

  return left.end_time.localeCompare(right.end_time);
}

function toHomeCardMarket(market: PublicMarketCardResponse | MarketResponse): HomeCardMarket {
  return {
    id: market.id,
    slug: market.slug,
    label: market.label,
    question: market.question,
    outcomes: market.outcomes,
    end_time: market.end_time,
    sort_order: market.sort_order,
    trading_status: market.trading_status,
    current_prices: "current_prices" in market ? market.current_prices ?? null : null,
    stats: "stats" in market ? market.stats ?? null : null,
    quote_summary: "quote_summary" in market ? market.quote_summary ?? null : null,
    last_trade_yes_bps: "last_trade_yes_bps" in market ? market.last_trade_yes_bps ?? null : null,
    market_metadata: "market_metadata" in market ? market.market_metadata ?? null : null,
  };
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

function formatSelectionProbability(market: {
  current_prices?: MarketCurrentPricesResponse | null;
  quote_summary?: MarketQuoteSummaryResponse | null;
  last_trade_yes_bps?: number | null;
} | null): string {
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

function formatEventVolumeSummary(markets: readonly HomeCardMarket[]): string | null {
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

function buildEventHref(eventSlug: string, marketSlug?: string): string {
  return `/event/${encodeURIComponent(eventSlug)}`;
}

function buildMarketHref(eventSlug: string, marketSlug: string): string {
  return buildEventHref(eventSlug, marketSlug);
}

function buildOutcomeHref(eventSlug: string, marketSlug: string, outcomeIndex: number): string {
  return buildEventHref(eventSlug, marketSlug);
}

function rememberPreferredMarket(eventSlug: string, marketSlug?: string) {
  if (!marketSlug || typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      `${EVENT_PRIMARY_MARKET_STORAGE_PREFIX}${eventSlug}`,
      JSON.stringify(marketSlug),
    );
  } catch {
    // Ignore storage failures and fall back to route-only navigation.
  }
}

function RewardsIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <line
        x1="9"
        y1="5.25"
        x2="9"
        y2="16.25"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
      />
      <path
        d="M3.75,3.5c0-.966,.784-1.75,1.75-1.75,2.589,0,3.5,3.5,3.5,3.5h-3.5c-.966,0-1.75-.784-1.75-1.75Z"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
      />
      <path
        d="M12.5,5.25h-3.5s.911-3.5,3.5-3.5c.966,0,1.75,.784,1.75,1.75s-.784,1.75-1.75,1.75Z"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
      />
      <path
        d="M14.25,8.25v6c0,1.105-.895,2-2,2H5.75c-1.105,0-2-.895-2-2v-6"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
      />
      <rect
        x="1.75"
        y="5.25"
        width="14.5"
        height="3"
        rx="1"
        ry="1"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
      />
    </svg>
  );
}

function BookmarkIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M5.25 2.25h7.5a1 1 0 0 1 1 1v11.143a.357.357 0 0 1-.607.253L9 10.504l-4.143 4.142a.357.357 0 0 1-.607-.253V3.25a1 1 0 0 1 1-1Z"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
      />
    </svg>
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

function EventArtwork(props: { card: GroupedMarketEvent; eager?: boolean }) {
  const title = props.card.event.title.trim();
  const fallbackLetter = title.charAt(0).toUpperCase() || "M";
  const eventImageUrl = () => normalizeOptionalMediaUrl(props.card.event.image_url);

  return (
    <div class="pm-compact-card__art">
      <Show
        when={eventImageUrl()}
        fallback={<span class="pm-compact-card__art-fallback">{fallbackLetter}</span>}
      >
        {value => (
          <img
            src={value() ?? ""}
            alt={`${props.card.event.title} card icon`}
            loading={props.eager ? "eager" : "lazy"}
            decoding={props.eager ? "sync" : "async"}
            fetchpriority={props.eager ? "high" : "auto"}
          />
        )}
      </Show>
    </div>
  );
}

function CompactMatchParticipantRow(props: {
  participant: EventMatchParticipantResponse;
  showScore: boolean;
  metric: string;
}) {
  return (
    <div class="pm-sport-card__team-row pm-sport-card__team-row--compact">
      <div class="pm-sport-card__team">
        <MatchParticipantBadge participant={props.participant} />
        <Show when={props.showScore}>
          <span class="pm-sport-card__team-score-inline">{props.participant.score ?? 0}</span>
        </Show>
        <span class="pm-sport-card__team-name">{getMatchParticipantLabel(props.participant)}</span>
      </div>

      <span class="pm-sport-card__team-metric">{props.metric}</span>
    </div>
  );
}

function OutcomeButton(props: {
  eventSlug: string;
  marketSlug: string;
  label: string;
  outcomeIndex: number;
}) {
  return (
    <A
      href={buildOutcomeHref(props.eventSlug, props.marketSlug, props.outcomeIndex)}
      onClick={() => rememberPreferredMarket(props.eventSlug, props.marketSlug)}
      class={
        props.outcomeIndex === 0
          ? "pm-compact-card__outcome pm-compact-card__outcome--yes"
          : "pm-compact-card__outcome pm-compact-card__outcome--no"
      }
    >
      {props.label}
    </A>
  );
}

function CompactMarketCard(props: {
  card: GroupedMarketEvent;
  eagerData?: boolean;
  eagerImage?: boolean;
}) {
  const [snapshotMarkets, setSnapshotMarkets] = createSignal<HomeCardMarket[] | null>(null);
  let cardRef: HTMLElement | undefined;
  const matchup = createMemo(() => props.card.event.matchup ?? null);
  const hasVisibleMatchScore = createMemo(() => hasMatchScore(matchup()));
  const displayedMarkets = createMemo<HomeCardMarket[]>(() => {
    const hydrated = snapshotMarkets();

    if (hydrated && hydrated.length > 0) {
      return hydrated;
    }

    return props.card.markets.map(toHomeCardMarket).sort(compareMarkets);
  });
  const matchResultMarkets = createMemo(() => getMatchResultMarkets(displayedMarkets()));
  const matchVolumeSummary = createMemo(() => formatEventVolumeSummary(displayedMarkets()));
  const primaryMarketSlug = createMemo(
    () => displayedMarkets()[0]?.slug ?? props.card.markets[0]?.slug,
  );
  const sportPrimaryMarketSlug = createMemo(
    () => matchResultMarkets().home?.slug ?? primaryMarketSlug(),
  );
  const shouldRenderSportCard = createMemo(() => {
    const results = matchResultMarkets();

    return Boolean(matchup() && (results.home || results.draw || results.away));
  });
  const sportMetaLabel = createMemo(() => {
    const competitionName = matchup()?.competition_name?.trim();

    if (competitionName) {
      return competitionName;
    }

    return formatCategoryLabel(
      props.card.event.subcategory_slug ?? props.card.event.category_slug,
    );
  });

  const syncStoredSnapshot = () => {
    const storedMarkets = readStoredEventMarkets(props.card.event.id);

    if (!storedMarkets || storedMarkets.length === 0) {
      return null;
    }

    const normalizedMarkets = storedMarkets.map(toHomeCardMarket).sort(compareMarkets);
    setSnapshotMarkets(normalizedMarkets);
    return normalizedMarkets;
  };

  const warmEventSnapshot = () => {
    if (syncStoredSnapshot()) {
      return;
    }

    void fetchEventMarketsSnapshot(props.card.event.id).then(response => {
      if (!response?.markets?.length) {
        return;
      }

      setSnapshotMarkets(response.markets.map(toHomeCardMarket).sort(compareMarkets));
    });
  };

  createEffect(() => {
    setSnapshotMarkets(null);

    syncStoredSnapshot();

    if (props.eagerData) {
      warmEventSnapshot();
    }
  });

  createEffect(() => {
    const card = cardRef;

    if (!card || snapshotMarkets() || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            warmEventSnapshot();
            observer.disconnect();
            break;
          }
        }
      },
      {
        rootMargin: "160px",
      },
    );

    observer.observe(card);

    onCleanup(() => {
      observer.disconnect();
    });
  });

  return (
    <div class="pm-compact-card-shell">
      <article
        classList={{
          "pm-compact-card": true,
          "pm-compact-card--sport": shouldRenderSportCard(),
        }}
        ref={cardRef}
        onPointerEnter={warmEventSnapshot}
        onPointerDown={warmEventSnapshot}
        onFocusIn={warmEventSnapshot}
        onTouchStart={warmEventSnapshot}
      >
        <Show
          when={shouldRenderSportCard() ? matchup() : null}
          fallback={
            <>
              <div class="pm-compact-card__header">
                <EventArtwork card={props.card} eager={props.eagerImage} />
                <div class="pm-compact-card__title-wrap">
                  <A
                    href={buildEventHref(props.card.event.slug)}
                    class="pm-compact-card__title-link"
                    onClick={() => rememberPreferredMarket(props.card.event.slug, primaryMarketSlug())}
                  >
                    <div class="pm-compact-card__title-box">
                      <h2 class="pm-compact-card__title">{props.card.event.title}</h2>
                    </div>
                  </A>
                </div>
              </div>

              <div class="pm-compact-card__body">
                <div class="pm-compact-card__rows">
                  <For each={displayedMarkets()}>
                    {market => (
                      <div class="pm-compact-card__row">
                        <div class="pm-compact-card__row-copy">
                          <A
                            href={buildMarketHref(props.card.event.slug, market.slug)}
                            class="pm-compact-card__row-link"
                            onClick={() => rememberPreferredMarket(props.card.event.slug, market.slug)}
                          >
                            <p class="pm-compact-card__row-label">{formatRowLabel(market)}</p>
                          </A>
                        </div>

                        <div class="pm-compact-card__row-actions">
                          <p class="pm-compact-card__metric">{formatMarketMetric(market)}</p>
                          <OutcomeButton
                            eventSlug={props.card.event.slug}
                            marketSlug={market.slug}
                            label={market.outcomes[0] ?? "Yes"}
                            outcomeIndex={0}
                          />
                          <OutcomeButton
                            eventSlug={props.card.event.slug}
                            marketSlug={market.slug}
                            label={market.outcomes[1] ?? "No"}
                            outcomeIndex={1}
                          />
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </div>

              <div class="pm-compact-card__footer">
                <p class="pm-compact-card__footer-text">{displayedMarkets().length} markets</p>
                <div class="pm-compact-card__footer-actions">
                  <button type="button" class="pm-compact-card__icon-button" aria-label="Rewards">
                    <RewardsIcon />
                  </button>
                  <button
                    type="button"
                    class="pm-compact-card__icon-button"
                    aria-label="Add to favorites"
                  >
                    <BookmarkIcon />
                  </button>
                </div>
              </div>
            </>
          }
        >
          {value => (
            <>
              <A
                href={buildEventHref(props.card.event.slug)}
                class="pm-sport-card__summary pm-sport-card__summary--compact"
                onClick={() =>
                  rememberPreferredMarket(props.card.event.slug, sportPrimaryMarketSlug())
                }
              >
                <CompactMatchParticipantRow
                  participant={value().home}
                  showScore={hasVisibleMatchScore()}
                  metric={formatSelectionProbability(matchResultMarkets().home)}
                />
                <CompactMatchParticipantRow
                  participant={value().away}
                  showScore={hasVisibleMatchScore()}
                  metric={formatSelectionProbability(matchResultMarkets().away)}
                />
              </A>

              <div class="pm-sport-card__actions pm-sport-card__actions--compact">
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

              <div class="pm-sport-card__footer pm-sport-card__footer--compact">
                <p class="pm-sport-card__footer-text">
                  {matchVolumeSummary() ?? `${props.card.marketCount} markets`}
                  <span> · </span>
                  {sportMetaLabel()}
                  <span> · </span>
                  {formatMatchKickoffLabel(props.card.startsAt ?? props.card.nextEndTime) ?? "TBD"}
                </p>
                <div class="pm-sport-card__footer-actions">
                  <button type="button" class="pm-sport-card__icon-button" aria-label="Rewards">
                    <RewardsIcon />
                  </button>
                  <button
                    type="button"
                    class="pm-sport-card__icon-button"
                    aria-label="Add to favorites"
                  >
                    <BookmarkIcon />
                  </button>
                </div>
              </div>
            </>
          )}
        </Show>
      </article>
    </div>
  );
}

function CompactCardSkeleton() {
  return (
    <div class="pm-compact-card-shell">
      <article class="pm-compact-card pm-compact-card--skeleton" aria-hidden="true">
        <div class="pm-compact-card__header">
          <div class="pm-compact-card__art pm-compact-card__placeholder" />
          <div class="pm-compact-card__title-wrap">
            <div class="pm-compact-card__title-box">
              <div class="pm-compact-card__line pm-compact-card__line--title" />
            </div>
          </div>
        </div>

        <div class="pm-compact-card__body">
          <div class="pm-compact-card__rows">
            <For each={Array.from({ length: 2 })}>
              {() => (
                <div class="pm-compact-card__row">
                  <div class="pm-compact-card__row-copy">
                    <div class="pm-compact-card__line pm-compact-card__line--row" />
                  </div>
                  <div class="pm-compact-card__row-actions">
                    <div class="pm-compact-card__line pm-compact-card__line--metric" />
                    <div class="pm-compact-card__chip-placeholder" />
                    <div class="pm-compact-card__chip-placeholder" />
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>

        <div class="pm-compact-card__footer">
          <div class="pm-compact-card__line pm-compact-card__line--footer" />
          <div class="pm-compact-card__footer-actions">
            <div class="pm-compact-card__icon-placeholder" />
            <div class="pm-compact-card__icon-placeholder" />
          </div>
        </div>
      </article>
    </div>
  );
}

export default function PublicMarketSections(props: PublicMarketSectionsProps) {
  let loadTriggerRef: HTMLDivElement | undefined;

  createEffect(() => {
    const trigger = loadTriggerRef;

    if (
      !trigger ||
      typeof IntersectionObserver === "undefined" ||
      !props.onLoadMore ||
      !props.canLoadMore ||
      props.loadingMore ||
      props.loadMoreError
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            props.onLoadMore?.();
            break;
          }
        }
      },
      {
        rootMargin: "200px",
      },
    );

    observer.observe(trigger);

    onCleanup(() => {
      observer.disconnect();
    });
  });

  return (
    <section class="pm-all-markets">
      <section class="pm-all-markets__section">
        <div class="pm-all-markets__head">
          <h1 class="pm-all-markets__title">{props.title ?? "All markets"}</h1>
        </div>

        <Show
          when={!props.loading}
          fallback={
            <div class="pm-all-markets__grid">
              <For each={Array.from({ length: 12 })}>{() => <CompactCardSkeleton />}</For>
            </div>
          }
        >
          <Show
            when={!props.error}
            fallback={
              <div class="pm-home__state">
                <p class="pm-home__state-title">Unable to load markets</p>
                <p class="pm-home__state-copy">{props.error}</p>
                <Show when={props.onRetry}>
                  <button class="pm-button pm-button--primary" onClick={() => props.onRetry?.()}>
                    Retry
                  </button>
                </Show>
              </div>
            }
          >
            <div class="pm-all-markets__grid">
              <For each={props.cards}>
                {(card, index) => (
                  <CompactMarketCard
                    card={card}
                    eagerData={index() < EAGER_CARD_DATA_COUNT}
                    eagerImage={index() < EAGER_CARD_IMAGE_COUNT}
                  />
                )}
              </For>
              <Show when={props.loadingMore}>
                <For each={Array.from({ length: 3 })}>{() => <CompactCardSkeleton />}</For>
              </Show>
            </div>

            <Show when={props.loadMoreError}>
              <div class="pm-all-markets__load-state">
                <p class="pm-home__state-copy">{props.loadMoreError}</p>
                <Show when={props.onLoadMore}>
                  <button
                    type="button"
                    class="pm-button pm-button--primary"
                    onClick={() => props.onLoadMore?.()}
                  >
                    Try again
                  </button>
                </Show>
              </div>
            </Show>

            <Show when={props.canLoadMore || props.loadingMore}>
              <div
                ref={element => {
                  loadTriggerRef = element;
                }}
                class="pm-all-markets__load-trigger"
                aria-hidden="true"
              />
            </Show>
          </Show>
        </Show>
      </section>
    </section>
  );
}
