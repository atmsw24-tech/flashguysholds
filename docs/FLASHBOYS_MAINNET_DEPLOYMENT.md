# FLASHBOYS Robinhood Chain deployment

This procedure deploys the independent FLASHBOYS factory and its Uniswap V3 graduation adapter. It sends real transactions on Robinhood Chain mainnet (chain ID 4663).

## Before deployment

- Review the Solidity contracts and have them independently audited.
- Ensure the deployer wallet is the wallet that should receive creator fees and control the factory.
- Fund that wallet with enough ETH for the factory, adapter, and configuration transactions.
- Confirm the Robinhood Chain Uniswap V3 position manager, WETH, factory, and 1% pool fee tier on-chain.
- Do not use a wallet holding funds you cannot afford to risk.

## Deploy

Run from the repository root after installing dependencies and building the Solidity artifacts:

```bash
npm install
npm run build
```

Set these variables in your local terminal only. Never commit a private key or add it to Vercel:

```bash
export DEPLOYER_PRIVATE_KEY=YOUR_DEPLOYER_PRIVATE_KEY
export CONFIRM_FLASHBOYS_MAINNET_DEPLOYMENT=YES
export ROBINHOOD_RPC_URL=https://rpc.mainnet.chain.robinhood.com
npm run deploy:flashboys
```

The deployment script deploys the factory, deploys the adapter against that factory, configures the adapter in the factory, authorizes it in the fee router, and reads those settings back. Save the printed factory, adapter, router, and holder-vault addresses.

## Configure Vercel

In the Vercel project `flashguysholds-5g8r`, add:

- Name: `VITE_FLASHBOYS_FACTORY_ADDRESS`
- Value: the factory address printed by the deployment script
- Environments: Production and Preview

Redeploy after saving the variable. This address is public contract configuration, not a secret. Do not add `DEPLOYER_PRIVATE_KEY` to Vercel.

## Verify deployment

Set the factory address locally and run:

```bash
export VITE_FLASHBOYS_FACTORY_ADDRESS=0xYOUR_FACTORY_ADDRESS
npm run verify:flashboys
```

The verifier checks the chain, deployed factory/router/adapter/vault, creator, 60/40 constants, adapter fee-collector authorization, and Uniswap V3 position-manager/WETH bytecode.

## What this verification does not prove

A successful configuration check does not prove that a token can graduate, that swaps work, that LP fees accrue, that fee harvesting works, or that a holder can claim a Merkle reward. Those need a dedicated end-to-end test on a fork or test environment before public mainnet launches are enabled.

## Holder snapshots

Before producing a reward snapshot, set `HOLDER_EXCLUDE_ADDRESSES` to a comma-separated list containing at least the token's bonding curve, Uniswap V3 pool, graduation adapter, factory, fee router, and holder rewards vault. Excluding the pool and protocol contracts prevents unclaimable LP/protocol balances from receiving holder rewards.

The holder vault can hold native ETH from bonding-curve fees and ERC-20 assets (WETH and the launched token) from post-graduation Uniswap fees. Publish and claim Merkle roots using the exact matching asset address; use the zero address only for native ETH.
