import { createSignal, For, Show } from "solid-js";
import { Portal } from "solid-js/web";

interface HowItWorksModalProps {
  open: boolean;
  onClose: () => void;
}

interface Step {
  title: string;
  description: string;
  icon: () => JSX.Element;
}

function BrowseIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="8" y="12" width="32" height="24" rx="2" stroke="currentColor" stroke-width="2" fill="none" />
      <path d="M8 18h32" stroke="currentColor" stroke-width="2" />
      <circle cx="13" cy="15" r="1" fill="currentColor" />
      <circle cx="17" cy="15" r="1" fill="currentColor" />
      <circle cx="21" cy="15" r="1" fill="currentColor" />
      <rect x="14" y="24" width="8" height="6" rx="1" fill="currentColor" opacity="0.3" />
      <rect x="26" y="24" width="8" height="6" rx="1" fill="currentColor" opacity="0.3" />
    </svg>
  );
}

function TradeIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path
        d="M12 20h20m0 0l-4-4m4 4l-4 4"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M36 28H16m0 0l4 4m-4-4l4-4"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <circle cx="24" cy="24" r="18" stroke="currentColor" stroke-width="2" fill="none" />
    </svg>
  );
}

function WinIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path
        d="M24 6v6m0 24v6m12-30l-4.24 4.24M16.24 31.76L12 36m24-12h6M6 24h6m25.76-7.76L42 12M6 36l4.24-4.24"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      />
      <circle cx="24" cy="24" r="8" fill="currentColor" opacity="0.3" />
      <path
        d="M24 16v8l4 4"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

const STEPS: Step[] = [
  {
    title: "Browse World Cup Markets",
    description:
      "Explore upcoming World Cup matches and prediction markets. View real-time odds, liquidity, and trading activity for each match outcome.",
    icon: BrowseIcon,
  },
  {
    title: "Buy & Sell Outcome Shares",
    description:
      "Trade shares on match outcomes you believe in. Buy 'Yes' if you think an outcome will happen, or 'No' if you don't. Prices reflect real-time market sentiment.",
    icon: TradeIcon,
  },
  {
    title: "Earn from Correct Predictions",
    description:
      "When a match concludes, winning shares are worth $1.00 each. Your profit is the difference between what you paid and the final value. All trades settle on X Layer.",
    icon: WinIcon,
  },
];

export default function HowItWorksModal(props: HowItWorksModalProps) {
  const [currentStep, setCurrentStep] = createSignal(0);

  const handleNext = () => {
    if (currentStep() < STEPS.length - 1) {
      setCurrentStep(currentStep() + 1);
    } else {
      props.onClose();
    }
  };

  const handlePrevious = () => {
    if (currentStep() > 0) {
      setCurrentStep(currentStep() - 1);
    }
  };

  const handleDotClick = (index: number) => {
    setCurrentStep(index);
  };

  const handleBackdropClick = (event: MouseEvent) => {
    if (event.target === event.currentTarget) {
      props.onClose();
    }
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      props.onClose();
    }
  };

  return (
    <Show when={props.open}>
      <Portal>
        <div
          class="pm-how-it-works-modal__overlay"
          onClick={handleBackdropClick}
          onKeyDown={handleKeyDown}
        >
          <section
            class="pm-how-it-works-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="how-it-works-title"
            onClick={event => event.stopPropagation()}
          >
            <button
              class="pm-how-it-works-modal__close"
              type="button"
              aria-label="Close"
              onClick={props.onClose}
            >
              <svg viewBox="0 0 18 18" aria-hidden="true">
                <path
                  d="M13.5 4.5l-9 9m0-9l9 9"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>

            <div class="pm-how-it-works-modal__content">
              <div class="pm-how-it-works-modal__icon">
                {STEPS[currentStep()].icon()}
              </div>

              <h2 id="how-it-works-title" class="pm-how-it-works-modal__title">
                {STEPS[currentStep()].title}
              </h2>

              <p class="pm-how-it-works-modal__description">
                {STEPS[currentStep()].description}
              </p>

              <div class="pm-how-it-works-modal__dots">
                <For each={STEPS}>
                  {(_, index) => (
                    <button
                      type="button"
                      class="pm-how-it-works-modal__dot"
                      classList={{
                        "pm-how-it-works-modal__dot--active": index() === currentStep(),
                      }}
                      aria-label={`Go to step ${index() + 1}`}
                      aria-current={index() === currentStep() ? "step" : undefined}
                      onClick={() => handleDotClick(index())}
                    />
                  )}
                </For>
              </div>

              <div class="pm-how-it-works-modal__actions">
                <Show when={currentStep() > 0}>
                  <button
                    type="button"
                    class="pm-button pm-button--ghost"
                    onClick={handlePrevious}
                  >
                    Previous
                  </button>
                </Show>

                <button
                  type="button"
                  class="pm-button pm-button--primary"
                  onClick={handleNext}
                >
                  {currentStep() < STEPS.length - 1 ? "Next" : "Get Started"}
                </button>
              </div>
            </div>
          </section>
        </div>
      </Portal>
    </Show>
  );
}
