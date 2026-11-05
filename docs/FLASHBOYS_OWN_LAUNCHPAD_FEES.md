# Independent FLASHBOYS fee model (Robinhood Chain)

## Target split

FLASHBOYS is building its own launchpad contracts. This design does not use Pons:
- 60% of each collected trading fee is sent to the token creator.
- 40% is sent to the FLASHBOYS holder-rewards vault.

The 60/40 percentages apply to the fee amount collected by the FLASHBOYS curve or pool, not to the full trade notional.

## Fee router foundation

`contracts/FlashboysFeeRouter.sol` is the independent fee-routing component. The creator deploys it and authorizes fee-collector contracts with `setFeeCollector`. An authorized bonding curve or pool calls `collectNativeFee()` with the native-asset fee, or `collectTokenFee(asset, amount)` after approving the router to transfer the fee token. Each collection splits atomically: 60% to the immutable creator address and 40% to the dedicated holder vault.

The holder vault accepts funded Merkle reward epochs. The 40% is therefore reserved for holder distributions; it is not automatically paid to every wallet at trade time. A verified holder indexer, eligibility policy, epoch builder, funding and claim UI are still required.

## What this does not yet prove or implement

- This router alone is not a complete launchpad and does not create tokens or bonding curves.
- A FLASHBOYS-owned factory and Robinhood Chain bonding-curve contract must be built and connected as authorized fee collectors.
- The curve must collect the fee on every buy and sell and call the router in the same transaction.
- Post-graduation fees require a FLASHBOYS-controlled pool fee mechanism (for example, a reviewed Uniswap v4 hook or a pool whose fee recipient is controlled by FLASHBOYS). Ordinary third-party pools do not automatically send fees to this router.
- No mainnet contract is deployed by this code change. Mainnet launches must remain disabled until the factory, curve, router and holder vault are tested together on a testnet/fork and independently reviewed.
- Never describe fees as earned or distributed until on-chain events and recipient balances confirm it.

## Required end-to-end tests

1. Deploy the holder vault and router; verify creator and vault addresses.
2. Authorize only the test bonding-curve contract.
3. Execute a buy and sell; assert the curve calculates the configured fee and sends it to the router.
4. Assert exact 60/40 distribution (including integer rounding) and that an unauthorized address cannot collect.
5. Test reverting creator/vault recipients, ERC-20 transfer failures, reentrancy attempts, and zero-value fees.
6. Fund a holder epoch, publish its root, and successfully claim a reward.
7. Repeat after graduation through the FLASHBOYS-controlled pool fee hook.

Until these pass, this is an implementation foundation, not a production-ready or verified fee system.
