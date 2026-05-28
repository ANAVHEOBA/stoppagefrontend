import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { Portal } from "solid-js/web";

import { readStoredAuthSession } from "~/lib/auth/session.ts";
import {
  ApiError,
  executePreparedMarketTransactions,
  marketClient,
  resolveTradeWallet,
  type MarketTradeExecutionResponse,
} from "~/lib/market/index.ts";
import {
  normalizeBuyUsdcTradeAmount,
  normalizeSellTradeAmount,
} from "~/lib/market/amount.ts";
import { readStoredWalletPreference } from "~/lib/wallet.ts";

import type { EventMarketListItem } from "./types.ts";

interface MarketTradePanelProps {
  market: EventMarketListItem;
  question: string;
  selectedOutcomeIndex: number;
  onSelectOutcome: (outcomeIndex: number) => void;
}

interface TradeDialogState {
  phase: "processing" | "success" | "error";
  title: string;
  copy: string;
}

const quickAmounts = ["1", "5", "10", "100"];
type TradeMode = "buy" | "sell";

function formatTradePrice(price: number): string {
  if (!Number.isFinite(price) || price <= 0) {
    return "--";
  }

  return `${Math.round(price * 100)}c`;
}

function getTradeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "code" in error) {
    const errorCode = (error as { code?: unknown }).code;

    if (errorCode === 4001) {
      return "Request rejected in your wallet.";
    }

    if (errorCode === -32002) {
      return "Open your wallet to continue the pending request.";
    }
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unable to submit this trade.";
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 13 13" aria-hidden="true">
      <path
        d="M1.5 1.5 11.5 11.5"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-width="1.5"
      />
      <path
        d="M11.5 1.5 1.5 11.5"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-width="1.5"
      />
    </svg>
  );
}

function SuccessCheckIcon() {
  return (
    <svg viewBox="0 0 56 56" aria-hidden="true">
      <circle cx="28" cy="28" r="24" fill="currentColor" opacity="0.12" />
      <circle cx="28" cy="28" r="19" fill="none" stroke="currentColor" stroke-width="2.5" />
      <path
        d="m19.5 28.5 6 6 11-12"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="3"
      />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg viewBox="0 0 56 56" aria-hidden="true">
      <circle cx="28" cy="28" r="24" fill="currentColor" opacity="0.12" />
      <circle cx="28" cy="28" r="19" fill="none" stroke="currentColor" stroke-width="2.5" />
      <path
        d="M28 18v12"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-width="3"
      />
      <circle cx="28" cy="39" r="2.25" fill="currentColor" />
    </svg>
  );
}

export default function MarketTradePanel(props: MarketTradePanelProps) {
  const [mode, setMode] = createSignal<TradeMode>("buy");
  const [amount, setAmount] = createSignal("0");
  const [isSubmitting, setSubmitting] = createSignal(false);
  const [statusMessage, setStatusMessage] = createSignal<string | null>(null);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);
  const [result, setResult] = createSignal<MarketTradeExecutionResponse | null>(null);
  const [transactionHashes, setTransactionHashes] = createSignal<string[]>([]);
  const [tradeDialog, setTradeDialog] = createSignal<TradeDialogState | null>(null);
  const selectedQuote = createMemo(
    () => props.market.quotes[props.selectedOutcomeIndex] ?? props.market.quotes[0],
  );
  const submitLabel = createMemo(() => {
    const actionLabel = mode() === "buy" ? "Buy" : "Sell";
    const outcomeLabel = selectedQuote()?.label ?? "Outcome";

    if (isSubmitting()) {
      return mode() === "buy" ? "Submitting buy..." : "Submitting sell...";
    }

    return `${actionLabel} ${outcomeLabel}`;
  });
  const latestTransactionHash = createMemo(
    () => transactionHashes()[transactionHashes().length - 1] ?? result()?.tx_hash ?? null,
  );
  const tradeDialogIsDismissible = createMemo(() => {
    const phase = tradeDialog()?.phase;
    return phase === "success" || phase === "error";
  });
  const tradeDialogAmountLabel = createMemo(() =>
    mode() === "buy" ? `$${amount()}` : `${amount()} shares`,
  );
  const tradeDialogActionLabel = createMemo(() =>
    `${mode() === "buy" ? "Buy" : "Sell"} ${selectedQuote()?.label ?? "Outcome"}`,
  );
  const tradeDialogPriceLabel = createMemo(() =>
    result() ? formatTradePrice(result()!.price) : selectedQuote()?.centsLabel ?? "--",
  );

  createEffect(() => {
    props.market.slug;
    setMode("buy");
    setAmount("0");
    setStatusMessage(null);
    setErrorMessage(null);
    setResult(null);
    setTransactionHashes([]);
    setTradeDialog(null);
  });

  createEffect(() => {
    const dialog = tradeDialog();

    if (!dialog || typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && tradeDialogIsDismissible()) {
        setTradeDialog(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    onCleanup(() => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    });
  });

  const closeTradeDialog = () => {
    if (!tradeDialogIsDismissible()) {
      return;
    }

    setTradeDialog(null);
  };

  const handleSubmit = async () => {
    if (isSubmitting()) {
      return;
    }

    const session = readStoredAuthSession();

    if (!session?.token) {
      setStatusMessage(null);
      setErrorMessage("Sign in to place a trade.");

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("stoppage:open-auth-modal"));
      }

      return;
    }

    const normalizedAmount =
      mode() === "buy"
        ? normalizeBuyUsdcTradeAmount(amount())
        : normalizeSellTradeAmount(amount());

    if (!normalizedAmount) {
      setStatusMessage(null);
      setErrorMessage(
        mode() === "buy"
          ? "Enter a valid USDC amount to buy."
          : "Enter a valid token amount to sell.",
      );
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setResult(null);
    setTransactionHashes([]);
    setStatusMessage(mode() === "buy" ? "Submitting buy..." : "Submitting sell...");
    setTradeDialog({
      phase: "processing",
      title: "Submitting order",
      copy:
        mode() === "buy"
          ? "Routing your buy order and preparing execution."
          : "Routing your sell order and preparing execution.",
    });

    try {
      const response =
        mode() === "buy"
          ? await marketClient.buyMarket(session.token, props.market.id, {
              trade: {
                outcome_index: props.selectedOutcomeIndex,
                usdc_amount: normalizedAmount,
              },
            })
          : await marketClient.sellMarket(session.token, props.market.id, {
              trade: {
                outcome_index: props.selectedOutcomeIndex,
                token_amount: normalizedAmount,
              },
            });

      if (response.execution_mode === "smart_account") {
        setResult(response);
        setStatusMessage("Trade submitted.");
        setTradeDialog({
          phase: "success",
          title: "Order submitted",
          copy: "Your trade has been accepted and is being processed.",
        });
        return;
      }

      if (response.execution_mode !== "external_wallet") {
        throw new Error(`Unsupported execution mode: ${response.execution_mode}`);
      }

      const preparedTransactions = response.prepared_transactions ?? [];

      if (preparedTransactions.length === 0) {
        throw new Error("Backend returned no transactions for the connected wallet.");
      }

      const preferredWallet = readStoredWalletPreference();
      const wallet = await resolveTradeWallet(
        response.wallet_address,
        preferredWallet?.walletKind,
      );

      if (!wallet) {
        throw new Error(
          "Reconnect the same external wallet you used for sign-in before trading.",
        );
      }

      const walletCopy =
        preparedTransactions[0]?.kind === "approval"
          ? "Approve the allowance first, then confirm the trade in your wallet."
          : "Confirm the trade in your wallet to continue.";

      setStatusMessage(
        preparedTransactions[0]?.kind === "approval"
          ? "Confirm the approval and trade in your wallet."
          : "Confirm the trade in your wallet.",
      );
      setTradeDialog({
        phase: "processing",
        title: "Awaiting wallet confirmation",
        copy: walletCopy,
      });

      const hashes = await executePreparedMarketTransactions({
        wallet,
        walletAddress: response.wallet_address,
        chainId: session.user.wallet?.chain_id,
        preparedTransactions,
      });

      setResult(response);
      setTransactionHashes(hashes);
      setStatusMessage(
        hashes.length > 1
          ? "Transactions sent from your wallet."
          : "Transaction sent from your wallet.",
      );
      setTradeDialog({
        phase: "success",
        title: "Trade sent successfully",
        copy:
          hashes.length > 1
            ? "Your approval and trade transactions were sent from your wallet."
            : "Your trade transaction was sent from your wallet.",
      });
    } catch (error) {
      const message = getTradeErrorMessage(error);
      setStatusMessage(null);
      setErrorMessage(message);
      setTradeDialog({
        phase: "error",
        title: "Trade not completed",
        copy: message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <aside class="pm-trade-panel">
        <div class="pm-trade-panel__market">
          <p class="pm-trade-panel__label">{props.market.label}</p>
          <p class="pm-trade-panel__headline">
            {selectedQuote()?.label ?? "Quote"} {selectedQuote()?.centsLabel ?? "--"}
          </p>
          <p class="pm-trade-panel__subcopy">{props.question}</p>
        </div>

        <div class="pm-trade-panel__mode">
          <button
            type="button"
            class="pm-trade-panel__mode-tab"
            classList={{ "pm-trade-panel__mode-tab--active": mode() === "buy" }}
            onClick={() => setMode("buy")}
          >
            Buy
          </button>
          <button
            type="button"
            class="pm-trade-panel__mode-tab"
            classList={{ "pm-trade-panel__mode-tab--active": mode() === "sell" }}
            onClick={() => setMode("sell")}
          >
            Sell
          </button>
        </div>

        <div class="pm-trade-panel__quote-grid">
          <For each={props.market.quotes.slice(0, 2)}>
            {quote => (
              <button
                type="button"
                classList={{
                  "pm-trade-panel__quote": true,
                  "pm-trade-panel__quote--yes": quote.outcomeIndex === 0,
                  "pm-trade-panel__quote--no": quote.outcomeIndex !== 0,
                  "pm-trade-panel__quote--selected":
                    quote.outcomeIndex === props.selectedOutcomeIndex,
                }}
                onClick={() => props.onSelectOutcome(quote.outcomeIndex)}
              >
                <span>{quote.label}</span>
                <strong>{quote.centsLabel}</strong>
              </button>
            )}
          </For>
        </div>

        <label class="pm-trade-panel__amount">
          <span class="pm-trade-panel__amount-label">
            {mode() === "buy" ? "Amount" : "Shares"}
          </span>
          <div class="pm-trade-panel__amount-box">
            <Show when={mode() === "buy"}>
              <span class="pm-trade-panel__amount-currency">$</span>
            </Show>
            <input
              type="text"
              inputmode="decimal"
              value={amount()}
              onInput={event => setAmount(event.currentTarget.value)}
              aria-label="Trade amount"
            />
          </div>
        </label>

        <Show when={mode() === "buy"}>
          <div class="pm-trade-panel__quick-picks">
            <For each={quickAmounts}>
              {value => (
                <button type="button" onClick={() => setAmount(value)}>
                  +${value}
                </button>
              )}
            </For>
          </div>
        </Show>

        <button
          type="button"
          class="pm-button pm-button--primary pm-trade-panel__submit"
          disabled={isSubmitting()}
          onClick={() => void handleSubmit()}
        >
          {submitLabel()}
        </button>

        <Show when={statusMessage()}>
          <p class="pm-trade-panel__feedback">{statusMessage()}</p>
        </Show>

        <Show when={errorMessage()}>
          <p class="pm-trade-panel__feedback pm-trade-panel__feedback--error">
            {errorMessage()}
          </p>
        </Show>

        <Show when={result()}>
          <div class="pm-trade-panel__summary">
            <p>
              {result()!.action} {result()!.outcome_label} at {formatTradePrice(result()!.price)}
            </p>
            <p>
              {result()!.execution_mode === "smart_account"
                ? "Backend submitted the trade."
                : "Wallet prepared and sent the trade client-side."}
            </p>
            <Show when={latestTransactionHash()}>
              <p class="pm-trade-panel__hash">{latestTransactionHash()}</p>
            </Show>
          </div>
        </Show>

        <Show when={transactionHashes().length > 1}>
          <div class="pm-trade-panel__tx-list">
            <For each={transactionHashes()}>
              {(hash, index) => (
                <p class="pm-trade-panel__hash">
                  Tx {index() + 1}: {hash}
                </p>
              )}
            </For>
          </div>
        </Show>

        <p class="pm-trade-panel__footnote">
          <Show
            when={result()?.execution_mode === "external_wallet"}
            fallback="Orderbook-based quotes are shown when liquidity is available for this market."
          >
            External-wallet trades are sent by the connected wallet. Backend trade stats are not
            marked yet on this path.
          </Show>
        </p>
      </aside>

      <Show when={tradeDialog()}>
        <Portal>
          <div class="pm-trade-flow__overlay" onClick={() => closeTradeDialog()}>
            <section
              class="pm-trade-flow"
              role="dialog"
              aria-modal="true"
              aria-labelledby="pm-trade-flow-title"
              onClick={event => event.stopPropagation()}
            >
              <div class="pm-trade-flow__frame">
                <div class="pm-trade-flow__header">
                  <div class="pm-trade-flow__header-slot" />
                  <div class="pm-trade-flow__header-copy">
                    <p class="pm-trade-flow__eyebrow">Trade status</p>
                  </div>
                  <div class="pm-trade-flow__header-slot pm-trade-flow__header-slot--end">
                    <Show when={tradeDialogIsDismissible()}>
                      <button
                        type="button"
                        class="pm-trade-flow__icon-button"
                        aria-label="Close trade dialog"
                        onClick={() => closeTradeDialog()}
                      >
                        <CloseIcon />
                      </button>
                    </Show>
                  </div>
                </div>

                <div class="pm-trade-flow__body">
                  <div
                    classList={{
                      "pm-trade-flow__hero": true,
                      "pm-trade-flow__hero--processing": tradeDialog()!.phase === "processing",
                      "pm-trade-flow__hero--success": tradeDialog()!.phase === "success",
                      "pm-trade-flow__hero--error": tradeDialog()!.phase === "error",
                    }}
                  >
                    <Show
                      when={tradeDialog()!.phase === "processing"}
                      fallback={
                        <Show
                          when={tradeDialog()!.phase === "success"}
                          fallback={<ErrorIcon />}
                        >
                          <SuccessCheckIcon />
                        </Show>
                      }
                    >
                      <div class="pm-trade-flow__spinner" aria-hidden="true" />
                    </Show>
                  </div>

                  <div class="pm-trade-flow__copy">
                    <h2 class="pm-trade-flow__title" id="pm-trade-flow-title">
                      {tradeDialog()!.title}
                    </h2>
                    <p class="pm-trade-flow__text">{tradeDialog()!.copy}</p>
                  </div>

                  <div class="pm-trade-flow__details">
                    <div class="pm-trade-flow__detail-row">
                      <span>Order</span>
                      <strong>{tradeDialogActionLabel()}</strong>
                    </div>
                    <div class="pm-trade-flow__detail-row">
                      <span>Market</span>
                      <strong>{props.market.label}</strong>
                    </div>
                    <div class="pm-trade-flow__detail-row">
                      <span>Price</span>
                      <strong>{tradeDialogPriceLabel()}</strong>
                    </div>
                    <div class="pm-trade-flow__detail-row">
                      <span>{mode() === "buy" ? "Amount" : "Shares"}</span>
                      <strong>{tradeDialogAmountLabel()}</strong>
                    </div>
                  </div>

                  <Show when={tradeDialog()!.phase === "success" && latestTransactionHash()}>
                    <div class="pm-trade-flow__tx">
                      <span class="pm-trade-flow__tx-label">Latest transaction</span>
                      <p class="pm-trade-flow__tx-hash">{latestTransactionHash()}</p>
                    </div>
                  </Show>

                  <Show when={tradeDialog()!.phase === "error"}>
                    <button
                      type="button"
                      class="pm-button pm-button--primary pm-trade-flow__action"
                      onClick={() => closeTradeDialog()}
                    >
                      Close
                    </button>
                  </Show>

                  <Show when={tradeDialog()!.phase === "success"}>
                    <button
                      type="button"
                      class="pm-button pm-button--primary pm-trade-flow__action"
                      onClick={() => closeTradeDialog()}
                    >
                      Done
                    </button>
                  </Show>
                </div>
              </div>
            </section>
          </div>
        </Portal>
      </Show>
    </>
  );
}
