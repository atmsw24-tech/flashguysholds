# FLASHGUYS

Discover what moves before everyone.

FLASHGUYS is an independent crypto token discovery platform designed to monitor and organize on-chain token activity across multiple networks.

## Supported Networks

- Solana
- Robinhood Chain

FLASHGUYS is an independent project and is not affiliated with, endorsed by, or operated by Robinhood.

## Current Status

The current version contains:

- React + Vite frontend
- Solana filtering
- Robinhood Chain filtering
- Trending view
- New token view
- Gainers view
- Volume view
- Token search
- Price display
- 24h change
- Volume
- Liquidity
- Token age
- Launch preparation UI
- Vercel API endpoints
- PostgreSQL schema
- Discovery worker foundation

The displayed token dataset is currently demo/fallback data.

## Development

Install dependencies:

npm install

Run development server:

npm run dev

Build:

npm run build

Preview production build:

npm run preview

Run worker:

npm run worker

## API

GET /api/health

GET /api/tokens

GET /api/tokens?chain=solana

GET /api/tokens?chain=robinhood

POST /api/launch

## Architecture

Frontend:

React + Vite

API:

Vercel serverless functions

Database:

PostgreSQL

Indexer:

Node.js worker

## Security

Private keys and seed phrases must never be placed in the frontend.

Never commit .env files.

Never place wallet secrets inside GitHub.

## Future Indexing

The intended discovery architecture is:

Solana RPC / WebSocket
        ↓
Solana indexer
        ↓
Normalization
        ↓
PostgreSQL
        ↑
Normalization
        ↑
Robinhood Chain indexer
        ↑
Robinhood Chain RPC / WebSocket

## Robinhood Chain

Robinhood Chain is an Ethereum-compatible Layer-2 network.

FLASHGUYS treats Robinhood Chain as a blockchain network and does not imply that tokens discovered by FLASHGUYS are officially listed, endorsed, or promoted by Robinhood.

## License

Project-specific license to be determined.

## Account database setup (Supabase)

1. Create or open your Supabase project.
2. In **SQL Editor**, run `supabase/migrations/20261021_profiles.sql` from this repository. It creates a private per-user `public.profiles` table, enables row-level security, and creates a profile row automatically when Supabase Auth creates an account.
3. In **Project Settings → API**, copy the project URL and publishable/anon key.
4. In Vercel → **Project → Settings → Environment Variables**, add:
   - `VITE_SUPABASE_URL` = your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase publishable/anon key
5. Apply the variables to Production (and Preview if needed), then redeploy.
6. Create a test account. Check **Authentication → Users** for the account and **Table Editor → profiles** for its profile row.

When a signed-in user connects a Solana or Robinhood Chain wallet, FLASHGUYS attempts to save that public wallet address to their own profile row. Wallet connections made while signed out remain local to that browser. Never put a Supabase service-role key, wallet private key, or seed phrase in frontend environment variables or GitHub.

The code changes do not connect this repository to your Supabase project automatically. You must run the SQL and configure the two Vercel variables before live account persistence can work.
