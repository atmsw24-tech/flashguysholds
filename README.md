# FLASHGUYS — GitHub + Vercel Deployment Ready

FLASHGUYS is an independent on-chain token discovery and launch platform foundation for Solana and Robinhood Chain.

## What is ready

- React + Vite frontend
- Vercel-compatible API routes under `api/`
- Solana / Robinhood Chain filters
- Trending / New Tokens / Gainers / Volume UI
- Search and token detail modal
- Live market refresh UI
- Launchpad UI and launch-preparation endpoint
- PostgreSQL/Supabase schema
- Helius webhook receiver for Solana events
- Alchemy webhook receiver for Robinhood Chain events
- Optional Robinhood Chain WebSocket worker
- Starter fixed-supply FLASHGUYS ERC-20 contract
- GitHub Actions build check
- Vercel configuration
- Health endpoint at `/api/health`

## Important: what still needs provider configuration

The repository is deployment-ready, but blockchain indexing is not magically supplied by GitHub or Vercel. Add the provider/database credentials in Vercel before expecting persistent live discovery.

The architecture is:

```text
GitHub
   ↓
Vercel
   ├── React/Vite frontend
   └── API functions
        ├── Helius → Solana events
        ├── Alchemy/RPC → Robinhood Chain
        └── Supabase/PostgreSQL → persistent data
```

The market UI also uses GeckoTerminal market data through the server-side API route.

## 1. GitHub

1. Create a new GitHub repository named `flashguys`.
2. Extract this ZIP.
3. Upload the files and folders to the repository root.
4. Make sure `.env` is NOT uploaded. Only `.env.example` belongs in GitHub.
5. Commit to the `main` branch.

GitHub Actions will run `npm ci` and `npm run build` on pushes and pull requests to `main`.

## 2. Vercel

1. Sign in to Vercel.
2. Import the GitHub repository.
3. Keep the detected framework as Vite.
4. Build command: `npm run build`.
5. Output directory: `dist`.
6. Deploy.

Vercel automatically deploys new commits from the connected GitHub repository.

## 3. Vercel environment variables

Add these in Vercel Project Settings → Environment Variables.

### Required for database-backed indexing

- `DATABASE_URL`

### Solana

- `HELIUS_API_KEY`
- `HELIUS_WEBHOOK_SECRET` (recommended)
- `VITE_SOLANA_RPC_URL` (optional; defaults to Solana public RPC)

### Robinhood Chain

- `ALCHEMY_API_KEY`
- `ALCHEMY_WEBHOOK_SIGNING_KEY` (recommended for webhook verification)
- `ROBINHOOD_RPC_URL`
- `ROBINHOOD_CHAIN_ID=4663`

### Market data

- `GECKOTERMINAL_API=https://api.geckoterminal.com/api/v2`

### Public frontend values

- `VITE_APP_NAME=FLASHGUYS`
- `VITE_ROBINHOOD_CHAIN_ID=4663`
- `VITE_ROBINHOOD_RPC_URL=https://rpc.mainnet.chain.robinhood.com`

Do not put private keys, seed phrases, or wallet secrets in GitHub or Vercel frontend (`VITE_`) variables.

## 4. Database

Create a Supabase/PostgreSQL database and run:

```text
db/schema.sql
```

This creates tables for tokens, chain events, launches, watchlists and alerts.

## 5. Test the deployment

After Vercel deploys, open:

```text
https://YOUR-DOMAIN.vercel.app/api/health
```

You should receive JSON with `ok: true`.

Then open the main site and test:

- All / Solana / Robinhood Chain
- Trending / New Tokens / Gainers / Volume
- Search
- Token detail modal
- Live market panel
- Launch section

## 6. Webhooks

Configure your blockchain providers to POST events to:

```text
https://YOUR-DOMAIN.vercel.app/api/webhooks/helius
https://YOUR-DOMAIN.vercel.app/api/webhooks/alchemy
```

The webhook routes are designed to store normalized events in `chain_events` when `DATABASE_URL` is configured.

## 7. Persistent Robinhood WebSocket worker

`worker/index.js` is intentionally separate from the Vercel web deployment because a long-lived WebSocket process should not be treated as a normal serverless request.

Run it on a persistent worker/VM/container when you are ready:

```bash
npm install
npm run worker
```

Set `ROBINHOOD_WS_URL` to your production WebSocket endpoint.

## 8. Vercel Hobby note

Do not rely on a five-minute Vercel Cron for blockchain indexing. Vercel's current Hobby cron restrictions limit scheduled jobs to once per day. Use provider webhooks and a persistent worker for real-time ingestion instead.

## 9. Launching tokens

The included launch API prepares configuration but does not submit a mainnet transaction. Real Solana SPL-token creation and Robinhood Chain ERC-20 deployment should be performed through the connected user's wallet, with explicit transaction signing.

The Solidity contract is a starter template, not an audited production contract. Test on testnet and review/audit it before any mainnet launch.

## Security rules

- Never commit `.env`.
- Never put private keys or seed phrases in frontend code.
- Never ask users for their wallet seed phrase/private key.
- Use wallet-signed, non-custodial transactions.
- Verify webhook signatures.
- Keep database credentials server-side.
- Add rate limiting and authentication before exposing sensitive admin/launch operations publicly.

## Local development

Requirements: Node.js 20+

```bash
npm install
npm run dev
```

For a production build check:

```bash
npm run build
```

For the optional Robinhood worker:

```bash
npm run worker
```
