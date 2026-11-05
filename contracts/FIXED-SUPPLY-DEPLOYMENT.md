# FLASHBOYS fixed-supply token enforcement

This repository contains separate fixed-supply issuance foundations for Solana and Robinhood Chain. They are not yet connected to the launch form and have not been deployed to mainnet.

## Solana SPL Token

The script `scripts/create-solana-fixed-supply-token.mjs` creates a standard SPL mint with 9 decimals, mints exactly 1,000,000,000 tokens to the deployer's associated token account, then revokes mint authority and freeze authority. It reads the mint account back and fails unless both authorities are null.

Set `SOLANA_RPC_URL` (defaults to devnet) and `SOLANA_KEYPAIR_PATH` (local keypair JSON path), then run `node scripts/create-solana-fixed-supply-token.mjs`.

Setting mint authority to null is irreversible. Test on devnet first. Never commit or upload the keypair.

## Robinhood Chain ERC-20

`RobinhoodFixedSupplyToken.sol` uses OpenZeppelin ERC-20. Its constructor mints exactly 1,000,000,000 tokens (18 decimals) once to the deployer. It has no mint function, owner role, or supply setter, so no administrative path exists to increase supply after deployment.

The source imports `@openzeppelin/contracts`; install that dependency and compile with Solidity 0.8.24 or later before deployment. Review compiler output, verify source on Robinhood Chain Explorer, and test before mainnet.

## Still required

- Connect these issuance paths to a secure wallet-signed launch flow; the current React form is not a deployer.
- Keep private keys out of frontend code and Vercel client environment variables.
- Verify total supply and authority state from chain data before showing a launch as fixed-supply.
- Add separate Solana and EVM transaction handling, failure recovery, and end-to-end tests.
- Obtain an independent security review before mainnet deployment.