# Stoppage Frontend

Public trading interface for **Stoppage**, a World Cup-native prediction market built on **X Layer**.

Live demo:

- [https://stoppagefrontend.vercel.app](https://stoppagefrontend.vercel.app)

Project account:

- [https://x.com/stoppagex](https://x.com/stoppagex)

## What this app does

- browse World Cup match events and child markets
- view prices, liquidity, orderbook, and recent trade activity
- buy and sell outcome shares
- sign in and load authenticated portfolio data
- navigate event-centric sports markets instead of isolated yes/no cards

The product goal is to make on-chain sports markets feel closer to a mainstream consumer app while still settling through X Layer infrastructure.

## Tech stack

- SolidStart
- SolidJS
- TypeScript
- Vite

## Local development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Test

```bash
npm test
```

## Environment

Create `.env` from `.env.example` and point the frontend at the running backend API.

## Related repos

- Root submission overview: [`../README.md`](../README.md)
- Backend API: [`../stoppagebackend`](../stoppagebackend)
- Admin console: [`../stoppageadminfrontend`](../stoppageadminfrontend)
- Contracts: [`../stoppagecontract`](../stoppagecontract)
