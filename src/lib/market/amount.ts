import { parseUsdcAmountInput } from "../faucet/amount.ts";

export function normalizeBuyUsdcTradeAmount(value: string): string | null {
  try {
    return parseUsdcAmountInput(value).baseUnits;
  } catch {
    return null;
  }
}

export function normalizeSellTradeAmount(value: string): string | null {
  try {
    return parseUsdcAmountInput(value).baseUnits;
  } catch {
    return null;
  }
}
