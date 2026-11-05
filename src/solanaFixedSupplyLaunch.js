import { Connection, Keypair, SystemProgram, Transaction, clusterApiUrl } from "@solana/web3.js";
import { AuthorityType, ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, createInitializeMintInstruction, createMintToInstruction, createSetAuthorityInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";

export const FIXED_SUPPLY_TOKENS = 1_000_000_000n;
export const SOLANA_DECIMALS = 9;
const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";

export async function deploySolanaFixedSupplyToken({ provider, name, symbol, onStatus }) {
  if (!provider?.publicKey || typeof provider.signAndSendTransaction !== "function") {
    throw new Error("Connect Phantom or Solflare before deploying.");
  }
  if (!String(name || "").trim() || !String(symbol || "").trim()) {
    throw new Error("Token name and ticker are required.");
  }

  const rpcUrl = import.meta.env.VITE_SOLANA_DEVNET_RPC || clusterApiUrl("devnet");
  const connection = new Connection(rpcUrl, "confirmed");
  const genesisHash = await connection.getGenesisHash();
  if (genesisHash !== DEVNET_GENESIS_HASH) {
    throw new Error("Safety stop: the configured Solana RPC is not Devnet. No transaction was sent.");
  }

  const mint = Keypair.generate();
  const owner = provider.publicKey;
  const lamports = await connection.getMinimumBalanceForRentExemption(82);
  const ata = getAssociatedTokenAddressSync(mint.publicKey, owner, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const rawSupply = FIXED_SUPPLY_TOKENS * 10n ** BigInt(SOLANA_DECIMALS);
  const tx = new Transaction();
  tx.add(
    SystemProgram.createAccount({ fromPubkey: owner, newAccountPubkey: mint.publicKey, space: 82, lamports, programId: TOKEN_PROGRAM_ID }),
    createInitializeMintInstruction(mint.publicKey, SOLANA_DECIMALS, owner, owner, TOKEN_PROGRAM_ID),
    createAssociatedTokenAccountInstruction(owner, ata, owner, mint.publicKey, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID),
    createMintToInstruction(mint.publicKey, ata, owner, rawSupply, [], TOKEN_PROGRAM_ID),
    createSetAuthorityInstruction(mint.publicKey, owner, AuthorityType.MintTokens, null, [], TOKEN_PROGRAM_ID),
    createSetAuthorityInstruction(mint.publicKey, owner, AuthorityType.FreezeAccount, null, [], TOKEN_PROGRAM_ID)
  );

  const latest = await connection.getLatestBlockhash("confirmed");
  tx.feePayer = owner;
  tx.recentBlockhash = latest.blockhash;
  tx.partialSign(mint);

  onStatus?.("Devnet confirmed. Approve the transaction in your Solana wallet; supply is fixed and both authorities are revoked in the same transaction.");
  let signature;
  try {
    const result = await provider.signAndSendTransaction(tx, { preflightCommitment: "confirmed", maxRetries: 3 });
    signature = typeof result === "string" ? result : result?.signature;
  } catch (error) {
    if (error?.code === 4001 || error?.code === "4001") throw new Error("Transaction was rejected in your wallet.");
    throw error;
  }
  if (!signature) throw new Error("Wallet did not return a Solana transaction signature.");

  const confirmation = await connection.confirmTransaction({ signature, ...latest }, "confirmed");
  if (confirmation.value?.err) throw new Error("Solana rejected the token creation transaction. Check the transaction on Devnet Explorer.");

  const parsed = await connection.getParsedAccountInfo(mint.publicKey, "confirmed");
  const info = parsed.value?.data?.parsed?.info;
  if (!info || info.mintAuthority !== null || info.freezeAuthority !== null || String(info.supply) !== rawSupply.toString()) {
    throw new Error("On-chain verification failed: expected exactly 1 billion tokens and null mint/freeze authorities.");
  }

  return {
    network: "Solana Devnet",
    mint: mint.publicKey.toBase58(),
    tokenAccount: ata.toBase58(),
    signature,
    supply: FIXED_SUPPLY_TOKENS.toString(),
    decimals: SOLANA_DECIMALS,
    mintAuthority: info.mintAuthority,
    freezeAuthority: info.freezeAuthority
  };
}
