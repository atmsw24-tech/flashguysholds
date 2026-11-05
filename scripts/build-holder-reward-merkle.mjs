import fs from "node:fs";
import path from "node:path";
import { AbiCoder, concat, formatEther, getAddress, keccak256, parseEther } from "ethers";

const [inputPath, epochArg] = process.argv.slice(2);
if (!inputPath || !epochArg || !/^\d+$/.test(epochArg)) {
  console.error("Usage: npm run holder:merkle -- <holders.json> <epoch-number>");
  process.exit(1);
}
const epoch = BigInt(epochArg);
const resolvedInput = path.resolve(inputPath);
const raw = JSON.parse(fs.readFileSync(resolvedInput, "utf8"));
const holders = Array.isArray(raw) ? raw : raw.holders;
if (!Array.isArray(holders) || holders.length === 0) throw new Error("Input must contain a non-empty holders array.");

const coder = AbiCoder.defaultAbiCoder();
const seen = new Set();
const claims = holders.map((holder) => {
  const address = getAddress(String(holder.address || ""));
  const key = address.toLowerCase();
  if (seen.has(key)) throw new Error(`Duplicate holder address: ${address}`);
  seen.add(key);
  const amountWei = holder.amountWei !== undefined
    ? BigInt(holder.amountWei)
    : parseEther(String(holder.amountEth || "0"));
  if (amountWei <= 0n) throw new Error(`Reward must be positive for ${address}`);
  const leaf = keccak256(coder.encode(["uint256", "address", "uint256"], [epoch, address, amountWei]));
  return { address, amountWei: amountWei.toString(), amountEth: formatEther(amountWei), leaf };
});

function pairHash(a, b) {
  const [left, right] = BigInt(a) < BigInt(b) ? [a, b] : [b, a];
  return keccak256(concat([left, right]));
}
const levels = [claims.map((claim) => claim.leaf)];
while (levels[levels.length - 1].length > 1) {
  const current = levels[levels.length - 1];
  const next = [];
  for (let i = 0; i < current.length; i += 2) {
    next.push(i + 1 < current.length ? pairHash(current[i], current[i + 1]) : current[i]);
  }
  levels.push(next);
}
const root = levels[levels.length - 1][0];
const outputClaims = claims.map((claim, originalIndex) => {
  let index = originalIndex;
  const proof = [];
  for (let level = 0; level < levels.length - 1; level += 1) {
    const sibling = index ^ 1;
    if (sibling < levels[level].length) proof.push(levels[level][sibling]);
    index = Math.floor(index / 2);
  }
  return { address: claim.address, amountWei: claim.amountWei, amountEth: claim.amountEth, proof };
});
const totalWei = claims.reduce((sum, claim) => sum + BigInt(claim.amountWei), 0n);
const output = { epoch: epoch.toString(), asset: "native ETH", root, totalWei: totalWei.toString(), totalEth: formatEther(totalWei), holderCount: claims.length, claims: outputClaims };
const outputPath = path.resolve(process.cwd(), `holder-rewards-epoch-${epoch}.json`);
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify({ epoch: output.epoch, root, totalWei: output.totalWei, holderCount: output.holderCount, outputPath }, null, 2));
