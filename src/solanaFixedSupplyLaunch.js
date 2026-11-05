import { Connection, Keypair, SystemProgram, Transaction, clusterApiUrl } from "@solana/web3.js";
import { AuthorityType, ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, createInitializeMintInstruction, createMintToInstruction, createSetAuthorityInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
export const FIXED_SUPPLY_TOKENS = 1_000_000_000n;
export const SOLANA_DECIMALS = 9;
export async function deploySolanaFixedSupplyToken({ provider, name, symbol, onStatus }) {
  if (!provider?.publicKey || typeof provider.signAndSendTransaction !== "function") throw new Error("Connect a Solana wallet that supports transaction signing.");
  if (!String(name || "").trim() || !String(symbol || "").trim()) throw new Error("Token name and ticker are required.");
  const connection = new Connection(import.meta.env.VITE_SOLANA_DEVNET_RPC || clusterApiUrl("devnet"), "confirmed");
  const mint = Keypair.generate(); const owner = provider.publicKey;
  const lamports = await connection.getMinimumBalanceForRentExemption(82);
  const ata = getAssociatedTokenAddressSync(mint.publicKey, owner, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const tx = new Transaction();
  tx.add(SystemProgram.createAccount({ fromPubkey: owner, newAccountPubkey: mint.publicKey, space: 82, lamports, programId: TOKEN_PROGRAM_ID }));
  tx.add(createInitializeMintInstruction(mint.publicKey, SOLANA_DECIMALS, owner, owner, TOKEN_PROGRAM_ID));
  tx.add(createAssociatedTokenAccountInstruction(owner, ata, owner, mint.publicKey, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID));
  tx.add(createMintToInstruction(mint.publicKey, ata, owner, FIXED_SUPPLY_TOKENS * 10n ** BigInt(SOLANA_DECIMALS), [], TOKEN_PROGRAM_ID));
  tx.add(createSetAuthorityInstruction(mint.publicKey, owner, AuthorityType.MintTokens, null, [], TOKEN_PROGRAM_ID));
  tx.add(createSetAuthorityInstruction(mint.publicKey, owner, AuthorityType.FreezeAccount, null, [], TOKEN_PROGRAM_ID));
  const latest = await connection.getLatestBlockhash("confirmed"); tx.feePayer = owner; tx.recentBlockhash = latest.blockhash; tx.partialSign(mint);
  onStatus?.("Approve token creation in your Solana wallet. Mint authority and freeze authority will be permanently revoked in the same transaction.");
  const result = await provider.signAndSendTransaction(tx, { preflightCommitment: "confirmed" });
  const signature = typeof result === "string" ? result : result?.signature; if (!signature) throw new Error("Wallet did not return a Solana transaction signature.");
  const confirmation = await connection.confirmTransaction({ signature, ...latest }, "confirmed"); if (confirmation.value?.err) throw new Error("Solana token creation failed on-chain.");
  const parsed = await connection.getParsedAccountInfo(mint.publicKey, "confirmed"); const info = parsed.value?.data?.parsed?.info;
  const expected = (FIXED_SUPPLY_TOKENS * 10n ** BigInt(SOLANA_DECIMALS)).toString();
  if (!info || info.mintAuthority !== null || info.freezeAuthority !== null || info.supply !== expected) throw new Error("On-chain verification failed: supply or authority state does not match fixed-supply policy.");
  return { network: "Solana Devnet", mint: mint.publicKey.toBase58(), tokenAccount: ata.toBase58(), signature, supply: FIXED_SUPPLY_TOKENS.toString(), decimals: SOLANA_DECIMALS, mintAuthority: info.mintAuthority, freezeAuthority: info.freezeAuthority };
}