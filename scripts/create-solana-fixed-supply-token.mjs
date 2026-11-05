import "dotenv/config";
import fs from "node:fs";
import { Connection, Keypair, clusterApiUrl } from "@solana/web3.js";
import { AuthorityType, createMint, getOrCreateAssociatedTokenAccount, mintTo, setAuthority, TOKEN_PROGRAM_ID } from "@solana/spl-token";

const SUPPLY_TOKENS = 1_000_000_000n;
const DECIMALS = 9;

async function main() {
  const rpcUrl = process.env.SOLANA_RPC_URL || clusterApiUrl("devnet");
  const keypairPath = process.env.SOLANA_KEYPAIR_PATH;
  if (!keypairPath) throw new Error("Set SOLANA_KEYPAIR_PATH to the deployer keypair JSON file.");
  const secret = Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, "utf8")));
  const payer = Keypair.fromSecretKey(secret);
  const connection = new Connection(rpcUrl, "confirmed");
  console.log("Deployer:", payer.publicKey.toBase58());

  // Create a mint with temporary mint/freeze authority held by the deployer.
  const mint = await createMint(connection, payer, payer.publicKey, payer.publicKey, DECIMALS, undefined, { commitment: "confirmed" }, TOKEN_PROGRAM_ID);
  const destination = await getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey, false, "confirmed", undefined, TOKEN_PROGRAM_ID);
  const baseUnits = SUPPLY_TOKENS * 10n ** BigInt(DECIMALS);
  const mintSignature = await mintTo(connection, payer, mint, destination.address, payer, baseUnits, [], { commitment: "confirmed" }, TOKEN_PROGRAM_ID);

  // Permanently revoke mint authority: no wallet can create more tokens.
  const revokeMintSignature = await setAuthority(connection, payer, mint, payer, AuthorityType.MintTokens, null, [], { commitment: "confirmed" }, TOKEN_PROGRAM_ID);
  // Also revoke freeze authority to prevent the deployer freezing token accounts.
  const revokeFreezeSignature = await setAuthority(connection, payer, mint, payer, AuthorityType.FreezeAccount, null, [], { commitment: "confirmed" }, TOKEN_PROGRAM_ID);

  const info = await connection.getParsedAccountInfo(mint, "confirmed");
  const parsed = info.value?.data?.parsed?.info;
  if (!parsed || parsed.mintAuthority !== null || parsed.freezeAuthority !== null) throw new Error("Verification failed: mint/freeze authority is not revoked.");
  console.log(JSON.stringify({ network: rpcUrl.includes("devnet") ? "Solana Devnet" : "Configured Solana RPC", mint: mint.toBase58(), tokenAccount: destination.address.toBase58(), supply: SUPPLY_TOKENS.toString(), decimals: DECIMALS, mintAuthority: parsed.mintAuthority, freezeAuthority: parsed.freezeAuthority, mintSignature, revokeMintSignature, revokeFreezeSignature }, null, 2));
}
main().catch((error) => { console.error("Fixed-supply token creation failed:", error); process.exitCode = 1; });