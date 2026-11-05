# Pons V2 fee distribution in FLASHBOYS

## Launch path

Robinhood Chain launches use the live Pons V2 factory at:

- Factory: `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e`
- Chain ID: `4663`
- Fee escrow: read from the factory at runtime
- Explorer: https://robinhoodchain.blockscout.com

FLASHBOYS reads the enabled Pons launch configurations, current fee policy, launch fee, and anti-snipe settings before launch. It pins the factory's `previewLaunchEconomics` digest into the launch call so an intervening config/policy change makes the transaction revert.

The Pons V2 token and bonding curve are deployed by Pons. The Pons launch configuration supplies the fixed 1,000,000,000-token supply. FLASHBOYS does not deploy its old plain ERC-20 for Robinhood mainnet launches.

## Fee flow

The launch sets `creatorFeeRecipient` to a new `FlashboysPonsFeeSplitter` contract.

1. Pons collects quote-denominated trading fees and credits creator proceeds to its shared fee escrow.
2. The Pons fee-sweep operator must sweep accrued curve fees; the graduated V4 hook also credits the same escrow. A balance is claimable only after it has been credited there.
3. Anyone can trigger `claimAndDistributeNative` on the splitter. The splitter claims its own Pons escrow balance and sends 80% to the creator and 20% to the holder-rewards vault.
4. The Pons protocol share remains at Pons and is never routed through the FLASHBOYS splitter.
5. The creator publishes one immutable Merkle root per holder-reward epoch. Eligible holders claim their ETH with a proof.

If Pons' live protocol share is 30% and buyback is disabled for the launch, the total trade-fee allocation is:

| Recipient | Share of total base trading fees |
| --- | ---: |
| Pons protocol | 30% |
| FLASHBOYS creator | 56% |
| FLASHBOYS holder rewards | 14% |

These are derived from the live Pons policy, not hard-coded. If the live protocol share differs, the creator and holder percentages change proportionally. The 80/20 split is applied only to Pons' creator-side proceeds. Creator tax is set to zero in this launch flow.

## Holder reward snapshots

The vault does not invent a holder list or decide who qualifies. The operator must first obtain a verified holder snapshot and apply the published eligibility rules (snapshot block/time, minimum balance, exclusions, and allocation formula).

Input example:

```json
{
  "holders": [
    { "address": "0x1111111111111111111111111111111111111111", "amountEth": "0.01" },
    { "address": "0x2222222222222222222222222222222222222222", "amountEth": "0.02" }
  ]
}
```

Generate the epoch root and proofs:

```bash
npm run holder:merkle -- holders.json 1
```

The script writes `holder-rewards-epoch-1.json` with the root, total ETH allocation, and an individual proof for every holder. Publish the root from the creator wallet in the Launchpad UI. Holders use their amount and proof to claim.

The script builds proofs only; it does not fetch holder balances, define eligibility, or fund the vault. Before publishing a root, verify that the vault has enough ETH to cover the total allocation.

## Safety and operational notes

- Robinhood launch is a real mainnet transaction. The UI requires an explicit mainnet confirmation and each wallet transaction requires user approval.
- Launch requires the live Pons launch fee plus gas. The fee is read from the factory.
- Splitter deployment and token launch are separate transactions. If the launch fails after splitter deployment, the error reports the deployed splitter address so it can be reused rather than deployed again.
- Fee claims can be triggered only after Pons has credited the splitter in its escrow.
- The holder vault publisher is the creator wallet. A published epoch root cannot be replaced.
- Holder rewards are not automatic until a trusted holder-balance indexer and snapshot policy are connected. No rewards or balances should be displayed as earned before on-chain funding and claims are verified.
- This code has not been audited. Do not treat it as production-safe until independent Solidity review, testnet simulation, and mainnet deployment verification are complete.
