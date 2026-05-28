import {
  For,
  Show,
  createEffect,
  createSignal,
  onCleanup,
  type Component,
} from "solid-js";
import { Portal } from "solid-js/web";

import { ApiError, GOOGLE_CLIENT_ID, authClient } from "../lib/auth/auth.ts";
import { startGooglePopupSignIn } from "../lib/auth/google.ts";
import { writeStoredAuthSession } from "../lib/auth/session.ts";
import type { AuthResponse } from "../lib/auth/types.ts";
import {
  discoverInjectedWallets,
  requestWalletAccount,
  shortenWalletAddress,
  signWalletMessage,
  writeStoredWalletPreference,
  type DiscoveredWallet,
  type WalletKind,
} from "../lib/wallet.ts";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onGoogleClick?: () => void;
  onWalletSelect?: (walletId: string) => void;
  onAuthenticated?: (response: AuthResponse) => void;
}

interface PendingWalletConnect {
  account: string;
  challengeId: string;
  signature: string;
  walletKind: WalletKind;
}

function GoogleIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="32"
      height="32"
      viewBox="0 0 32 32"
      class="pm-auth-google-button__icon"
      aria-hidden="true"
    >
      <g fill="currentColor">
        <path d="M29.44 16.318c0-.993-.089-1.947-.255-2.864H16v5.422h7.535c-.331 1.744-1.324 3.22-2.813 4.213v3.525h4.544c2.647-2.444 4.175-6.033 4.175-10.296Z" />
        <path d="M16 30c3.78 0 6.949-1.247 9.265-3.385l-4.544-3.525c-1.247.84-2.838 1.349-4.722 1.349-3.64 0-6.733-2.456-7.84-5.765l-2.717 2.09-1.941 1.525c2.304 4.569 7.025 7.713 12.498 7.713Z" />
        <path d="M8.16 18.66c-.28-.84-.445-1.731-.445-2.66s.165-1.82.445-2.66V9.725H3.502C2.547 11.609 2 13.734 2 16s.547 4.391 1.502 6.275h3.332Z" />
        <path d="M16 7.575c2.062 0 3.895.713 5.358 2.087l4.009-4.009C22.936 3.388 19.78 2 16 2 10.527 2 5.805 5.144 3.502 9.725L8.16 13.34c1.107-3.309 4.2-5.765 7.84-5.765" />
      </g>
    </svg>
  );
}

function MetaMaskIcon() {
  return (
    <svg viewBox="0 0 142 136.878" aria-hidden="true">
      <path
        d="M132.682 132.192l-30.583-9.106-23.063 13.787-16.092-.007-23.077-13.78-30.569 9.106L0 100.801l9.299-34.839L0 36.507 9.299 0l47.766 28.538h27.85L132.682 0l9.299 36.507-9.299 29.455 9.299 34.839-9.299 31.391Z"
        fill="#FF5C16"
      />
      <path
        d="M9.305 0 57.072 28.558l-1.899 19.599L9.305 0Zm30.57 100.814 21.017 16.01-21.017 6.261v-22.271Zm19.337-26.469-4.039-26.174L29.317 65.97v.006l-.014-.007v.013l.08 18.321 10.485-9.951h19.344ZM132.682 0 84.915 28.558l1.893 19.599L132.682 0ZM102.113 100.814l-21.018 16.01 21.018 6.261v-22.271Zm10.565-34.839h.007v-.013l-.013.007L86.815 48.171l-4.039 26.174h19.336l10.492 9.95.074-18.32Z"
        fill="#E34807"
      />
      <path
        d="M0 100.801 9.299 65.962h19.997l.073 18.327 27.584 6.843 8.092 21.039-4.16 4.633-21.017-16.01H0ZM141.981 100.801l-9.299-34.839h-19.998l-.073 18.327-27.582 6.843-8.093 21.039 4.159 4.633 21.018-16.01h39.868Zm-57.066-72.263h-27.85l-1.891 19.599 9.872 64.013h11.891l9.878-64.013-1.9-19.599Z"
        fill="#FF8D5D"
      />
    </svg>
  );
}

function CoinbaseIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="10" fill="#0052FF" />
      <rect width="20" height="20" rx="5.4" fill="#0052FF" />
      <path
        fill="#fff"
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M10.0001 17C13.8661 17 17.0001 13.866 17.0001 10C17.0001 6.13401 13.8661 3 10.0001 3C6.13413 3 3.00012 6.13401 3.00012 10C3.00012 13.866 6.13413 17 10.0001 17ZM8.25012 7.71429C7.95427 7.71429 7.71441 7.95414 7.71441 8.25V11.75C7.71441 12.0459 7.95427 12.2857 8.25012 12.2857H11.7501C12.046 12.2857 12.2858 12.0459 12.2858 11.75V8.25C12.2858 7.95414 12.046 7.71429 11.7501 7.71429H8.25012Z"
      />
    </svg>
  );
}

function BraveIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path
        d="M16 3.5 24.5 6.5l2.2 7.4-1.6 8.2L16 28.5 6.9 22.1l-1.6-8.2 2.2-7.4L16 3.5Z"
        fill="#fb542b"
      />
      <path
        d="M11.2 12.1h2.1l1.1-1.4h3.2l1.1 1.4h2.1l-1.6 6.6-3.2 2.3-3.2-2.3-1.6-6.6Zm2.4 1.8.9 3.7 1.5 1.1 1.5-1.1.9-3.7h-1.3l-1.1 1.4h-2l-1.1-1.4h-1.3Z"
        fill="#fff"
      />
    </svg>
  );
}

function PhantomIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="10" fill="#ab9ff2" />
      <path
        fill="#fff"
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M13.724 20.753c-1.181 1.754-3.161 3.974-5.795 3.974-1.245 0-2.443-.496-2.443-2.655 0-5.499 7.74-14.012 14.923-14.012 4.086 0 5.714 2.745 5.714 5.864 0 4.007-2.682 8.588-5.347 8.588-.846 0-1.261-.45-1.261-1.164 0-.186.032-.388.096-.595-.91 1.506-2.667 2.904-4.312 2.904-1.198 0-1.805-.73-1.805-1.755 0-.372.08-.76.23-1.149Zm5.18-8.463c-.65.001-1.093.536-1.091 1.3.001.764.447 1.314 1.098 1.313.635-.001 1.078-.552 1.076-1.316-.001-.764-.447-1.298-1.083-1.297Zm3.453-.004c-.65.001-1.093.536-1.092 1.3.002.764.447 1.314 1.099 1.313.635-.001 1.078-.552 1.076-1.316-.001-.764-.447-1.298-1.083-1.297Z"
      />
    </svg>
  );
}

function BrowserWalletIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="2.25" y="3.5" width="15.5" height="13" rx="3" fill="#FF6E00" />
      <rect x="4.25" y="5.5" width="11.5" height="9" rx="2" fill="#fff" />
      <path
        d="M8.2 12.6V8.1h2.45c1.13 0 1.85.62 1.85 1.62 0 .62-.29 1.1-.8 1.36l1.04 1.52H11.2l-.83-1.27H9.55v1.27H8.2Zm1.35-2.39h.96c.45 0 .74-.2.74-.56 0-.36-.29-.56-.74-.56h-.96v1.12Z"
        fill="#FF6E00"
      />
    </svg>
  );
}

const walletSkeletonTiles = Array.from({ length: 4 });

function getFallbackWalletIcon(kind: WalletKind): Component {
  switch (kind) {
    case "metamask":
      return MetaMaskIcon;
    case "coinbase":
      return CoinbaseIcon;
    case "brave":
      return BraveIcon;
    case "phantom":
      return PhantomIcon;
    default:
      return BrowserWalletIcon;
  }
}

function getWalletErrorMessage(error: unknown): string {
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

  return "Unable to complete wallet sign-in.";
}

function getGoogleErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unable to complete Google sign-in.";
}

function isUsernameRequiredError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 400 &&
    error.message === "username is required for new wallet users"
  );
}

function validateWalletUsername(value: string): string | null {
  const normalizedValue = value.trim().toLowerCase();

  if (normalizedValue.length === 0) {
    return "Enter a username to continue.";
  }

  if (normalizedValue.length < 3 || normalizedValue.length > 24) {
    return "Username must be between 3 and 24 characters.";
  }

  if (!/^[a-z0-9_]+$/.test(normalizedValue)) {
    return "Username can only use letters, numbers, and underscores.";
  }

  return null;
}

function WalletTileIcon(props: { wallet: DiscoveredWallet }) {
  const [useFallbackIcon, setUseFallbackIcon] = createSignal(false);
  const FallbackIcon = getFallbackWalletIcon(props.wallet.kind);

  return (
    <Show
      when={props.wallet.icon && !useFallbackIcon()}
      fallback={<FallbackIcon />}
    >
      <img
        src={props.wallet.icon}
        alt=""
        loading="lazy"
        referrerpolicy="no-referrer"
        onError={() => setUseFallbackIcon(true)}
      />
    </Show>
  );
}

export default function AuthModal(props: AuthModalProps) {
  const [wallets, setWallets] = createSignal<DiscoveredWallet[]>([]);
  const [isDiscoveringWallets, setDiscoveringWallets] = createSignal(false);
  const [activeWalletId, setActiveWalletId] = createSignal<string | null>(null);
  const [isGooglePending, setGooglePending] = createSignal(false);
  const [walletUsername, setWalletUsername] = createSignal("");
  const [pendingWalletConnect, setPendingWalletConnect] =
    createSignal<PendingWalletConnect | null>(null);
  const [statusMessage, setStatusMessage] = createSignal<string | null>(null);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);
  let discoveryId = 0;
  let closeTimer: number | undefined;

  createEffect(() => {
    if (!props.open || typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        props.onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    onCleanup(() => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    });
  });

  createEffect(() => {
    if (!props.open) {
      discoveryId += 1;
      setWallets([]);
      setDiscoveringWallets(false);
      setActiveWalletId(null);
      setGooglePending(false);
      setWalletUsername("");
      setPendingWalletConnect(null);
      setStatusMessage(null);
      setErrorMessage(null);

      if (closeTimer !== undefined) {
        window.clearTimeout(closeTimer);
        closeTimer = undefined;
      }

      return;
    }

    const currentDiscoveryId = ++discoveryId;

    setDiscoveringWallets(true);
    setErrorMessage(null);
    setStatusMessage(null);

    void discoverInjectedWallets()
      .then(discoveredWallets => {
        if (currentDiscoveryId !== discoveryId) {
          return;
        }

        setWallets(discoveredWallets);
      })
      .catch(error => {
        if (currentDiscoveryId !== discoveryId) {
          return;
        }

        setErrorMessage(getWalletErrorMessage(error));
      })
      .finally(() => {
        if (currentDiscoveryId !== discoveryId) {
          return;
        }

        setDiscoveringWallets(false);
      });
  });

  const finishAuthentication = (response: AuthResponse) => {
    writeStoredAuthSession(response);
    props.onAuthenticated?.(response);
  };

  const completeWalletAuthentication = async (
    pendingConnect: PendingWalletConnect,
    username?: string,
  ) => {
    const normalizedUsername = username?.trim().toLowerCase() || undefined;
    const response = await authClient.connectWallet({
      challenge_id: pendingConnect.challengeId,
      signature: pendingConnect.signature,
      ...(normalizedUsername ? { username: normalizedUsername } : {}),
    });

    finishAuthentication(response);
    writeStoredWalletPreference({
      walletKind: pendingConnect.walletKind,
      walletAddress: pendingConnect.account,
    });
    setPendingWalletConnect(null);
    setWalletUsername("");
    setStatusMessage(`Signed in as ${shortenWalletAddress(pendingConnect.account)}.`);

    closeTimer = window.setTimeout(() => {
      props.onClose();
    }, 700);
  };

  const handleGoogleClick = async () => {
    props.onGoogleClick?.();
    setErrorMessage(null);
    setStatusMessage(null);
    setPendingWalletConnect(null);
    setWalletUsername("");

    if (!GOOGLE_CLIENT_ID) {
      setErrorMessage("Google sign-in is not configured.");
      return;
    }

    setGooglePending(true);
    setStatusMessage("Connecting to Google...");

    try {
      const googleResult = await startGooglePopupSignIn(GOOGLE_CLIENT_ID);
      const response = await authClient.signInWithGoogle({
        credential: googleResult.credential,
        client_id: GOOGLE_CLIENT_ID,
      });

      finishAuthentication(response);
      setStatusMessage("Signed in with Google.");

      closeTimer = window.setTimeout(() => {
        props.onClose();
      }, 700);
    } catch (error) {
      setStatusMessage(null);
      setErrorMessage(getGoogleErrorMessage(error));
    } finally {
      setGooglePending(false);
    }
  };

  const handleWalletClick = async (wallet: DiscoveredWallet) => {
    props.onWalletSelect?.(wallet.kind);
    setActiveWalletId(wallet.id);
    setErrorMessage(null);
    setPendingWalletConnect(null);
    setWalletUsername("");
    setStatusMessage(`Connecting to ${wallet.name}...`);
    let pendingConnect: PendingWalletConnect | null = null;

    try {
      const account = await requestWalletAccount(wallet.provider);
      const challenge = await authClient.createWalletChallenge({
        wallet_address: account,
      });
      const signature = await signWalletMessage(
        wallet.provider,
        account,
        challenge.message,
      );
      pendingConnect = {
        account,
        challengeId: challenge.challenge_id,
        signature,
        walletKind: wallet.kind,
      };

      await completeWalletAuthentication(pendingConnect);
    } catch (error) {
      if (pendingConnect && isUsernameRequiredError(error)) {
        setPendingWalletConnect(pendingConnect);
        setStatusMessage("Choose a username to finish creating your wallet account.");
        setErrorMessage(null);
        return;
      }

      setStatusMessage(null);
      setErrorMessage(getWalletErrorMessage(error));
    } finally {
      setActiveWalletId(null);
    }
  };

  const handleWalletUsernameSubmit = async (event: SubmitEvent) => {
    event.preventDefault();

    const pendingConnect = pendingWalletConnect();

    if (!pendingConnect) {
      return;
    }

    const normalizedUsername = walletUsername().trim().toLowerCase();
    const validationError = validateWalletUsername(normalizedUsername);

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setErrorMessage(null);
    setStatusMessage("Creating your wallet account...");
    setActiveWalletId(pendingConnect.challengeId);

    try {
      await completeWalletAuthentication(pendingConnect, normalizedUsername);
    } catch (error) {
      setStatusMessage(null);
      setErrorMessage(getWalletErrorMessage(error));
    } finally {
      setActiveWalletId(null);
    }
  };

  return (
    <Show when={props.open}>
      <Portal>
        <div class="pm-auth-modal__overlay" onClick={props.onClose}>
          <section
            class="pm-auth-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pm-auth-modal-title"
            onClick={event => event.stopPropagation()}
          >
            <div class="pm-auth-modal__stack">
              <div class="pm-auth-modal__header">
                <h2 class="pm-auth-modal__title" id="pm-auth-modal-title">
                  Welcome to stoppage
                </h2>
              </div>

              <button
                class="pm-auth-google-button"
                type="button"
                disabled={isGooglePending() || activeWalletId() !== null}
                onClick={() => void handleGoogleClick()}
              >
                <GoogleIcon />
                <span>
                  {isGooglePending() ? "Connecting..." : "Continue with Google"}
                </span>
              </button>

              <div class="pm-auth-divider" aria-hidden="true">
                <div class="pm-auth-divider__line" />
                <span class="pm-auth-divider__label">OR</span>
                <div class="pm-auth-divider__line" />
              </div>

              <Show when={pendingWalletConnect()}>
                {() => (
                  <form class="pm-auth-username-form" onSubmit={handleWalletUsernameSubmit}>
                    <div class="pm-auth-username-form__header">
                      <p class="pm-auth-username-form__title">
                        Finish wallet sign-up
                      </p>
                      <p class="pm-auth-username-form__hint">
                        Pick a username to create your wallet account.
                      </p>
                    </div>

                    <label class="pm-auth-username-field">
                      <span class="pm-auth-username-field__label">Username</span>
                      <input
                        class="pm-auth-username-field__input"
                        type="text"
                        name="username"
                        inputMode="text"
                        autoComplete="username"
                        spellcheck={false}
                        value={walletUsername()}
                        placeholder="stoppage_user"
                        onInput={event =>
                          setWalletUsername(event.currentTarget.value)
                        }
                      />
                    </label>

                    <button
                      class="pm-auth-username-form__submit"
                      type="submit"
                      disabled={isGooglePending() || activeWalletId() !== null}
                    >
                      {activeWalletId() === pendingWalletConnect()?.challengeId
                        ? "Creating account..."
                        : "Continue with Wallet"}
                    </button>
                  </form>
                )}
              </Show>

              <Show
                when={!isDiscoveringWallets() || wallets().length > 0}
                fallback={
                  <div class="pm-auth-wallet-grid" aria-hidden="true">
                    <For each={walletSkeletonTiles}>
                      {() => <div class="pm-auth-wallet-skeleton" />}
                    </For>
                  </div>
                }
              >
                <Show
                  when={wallets().length > 0}
                  fallback={
                    <div class="pm-auth-wallet-empty">
                      <p>No browser wallet detected.</p>
                      <p>Install MetaMask, Coinbase Wallet, Brave Wallet, or Rabby.</p>
                    </div>
                  }
                >
                  <div class="pm-auth-wallet-grid">
                    <For each={wallets()}>
                      {wallet => (
                        <button
                          class={`pm-auth-wallet-tile${
                            activeWalletId() === wallet.id
                              ? " pm-auth-wallet-tile--active"
                              : ""
                          }`}
                          type="button"
                          aria-label={`Connect with ${wallet.name}`}
                          title={wallet.name}
                          disabled={
                            isGooglePending() || activeWalletId() !== null
                          }
                          onClick={() => void handleWalletClick(wallet)}
                        >
                          <span class="pm-auth-wallet-tile__icon">
                            <WalletTileIcon wallet={wallet} />
                          </span>
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
              </Show>

              <Show when={errorMessage() || statusMessage()}>
                <p
                  class={`pm-auth-wallet-feedback${
                    errorMessage() ? " pm-auth-wallet-feedback--error" : ""
                  }`}
                  role={errorMessage() ? "alert" : "status"}
                >
                  {errorMessage() || statusMessage()}
                </p>
              </Show>

              <div class="pm-auth-modal__footer">
                <a href="#terms">Terms</a>
                <span aria-hidden="true">•</span>
                <a href="#privacy">Privacy</a>
              </div>
            </div>
          </section>
        </div>
      </Portal>
    </Show>
  );
}
