import fs from "node:fs";
import path from "node:path";
import {
  Contract, Interface, JsonRpcProvider, ZeroAddress, formatEther, getAddress, id, parseEther,
} from "ethers";

const [tokenArg, deploymentBlockArg, startBlockArg, endBlockArg, rewardEthArg] = process.argv.slice(2);
const rpcUrl = process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
if (!tokenArg || !deploymentBlockArg || !startBlockArg || !endBlockArg || !rewardEthArg) {
  console.error("Usage: ROBINHOOD_RPC_URL=<rpc> node scripts/snapshot-robinhood-holders.mjs <token> <deploymentBlock> <startBlock> <endBlock> <rewardETH>");
  process.exit(1);
}
const token = getAddress(tokenArg);
const deploymentBlock = Number(deploymentBlockArg);
const startBlock = Number(startBlockArg);
const endBlock = Number(endBlockArg);
const rewardBudget = parseEther(rewardEthArg);
for (const [label, value] of [["deploymentBlock", deploymentBlock], ["startBlock", startBlock], ["endBlock", endBlock]]) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(label + " must be a non-negative safe integer.");
}
if (deploymentBlock > startBlock || startBlock > endBlock) throw new Error("Require deploymentBlock <= startBlock <= endBlock.");
if (rewardBudget <= 0n) throw new Error("Reward budget must be greater than zero.");

const provider = new JsonRpcProvider(rpcUrl);
const network = await provider.getNetwork();
if (network.chainId !== 4663n) throw new Error("RPC must point to Robinhood Chain mainnet (chain ID 4663).");
const abi = [
  "event Transfer(address indexed from,address indexed to,uint256 value)",
  "function decimals() view returns (uint8)",
];
const iface = new Interface(abi);
const tokenContract = new Contract(token, abi, provider);
const decimals = Number(await tokenContract.decimals());
const transferTopic = id("Transfer(address,address,uint256)");
const balances = new Map();
const weightedBalances = new Map();
const chunkSize = Number(process.env.LOG_CHUNK_SIZE || 1500);
if (!Number.isSafeInteger(chunkSize) || chunkSize < 1 || chunkSize > 10000) throw new Error("LOG_CHUNK_SIZE must be between 1 and 10000.");

function balanceOf(address) { return balances.get(address) || 0n; }
function accrue(blocks) {
  if (blocks <= 0) return;
  for (const [address, balance] of balances) {
    if (balance > 0n) weightedBalances.set(address, (weightedBalances.get(address) || 0n) + balance * BigInt(blocks));
  }
}

let cursor = deploymentBlock;
let nextAccrualBlock = startBlock;
let totalLogs = 0;
while (cursor <= endBlock) {
  const to = Math.min(endBlock, cursor + chunkSize - 1);
  const logs = await provider.getLogs({
    address: token,
    fromBlock: cursor,
    toBlock: to,
    topics: [transferTopic],
  });
  logs.sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);
  let i = 0;
  while (i < logs.length) {
    const blockNumber = logs[i].blockNumber;
    if (blockNumber >= startBlock) {
      const from = Math.max(nextAccrualBlock, startBlock);
      if (blockNumber > from) accrue(Math.min(blockNumber, endBlock + 1) - from);
      nextAccrualBlock = Math.max(nextAccrualBlock, blockNumber);
    }
    while (i < logs.length && logs[i].blockNumber === blockNumber) {
      const parsed = iface.parseLog(logs[i]);
      const from = getAddress(parsed.args.from);
      const toAddress = getAddress(parsed.args.to);
      const value = parsed.args.value;
      if (from !== ZeroAddress) {
        const updated = balanceOf(from) - value;
        if (updated < 0n) throw new Error("Negative reconstructed balance for " + from + ". Check deployment block and complete Transfer history.");
        balances.set(from, updated);
      }
      if (toAddress !== ZeroAddress) balances.set(toAddress, balanceOf(toAddress) + value);
      totalLogs += 1;
      i += 1;
    }
  }
  cursor = to + 1;
  console.log("Indexed Transfer logs through block " + to + " (" + totalLogs + " events).");
}
const finalAccrualStart = Math.max(nextAccrualBlock, startBlock);
if (endBlock + 1 > finalAccrualStart) accrue(endBlock + 1 - finalAccrualStart);

const weighted = [...weightedBalances.entries()].filter(([, weight]) => weight > 0n);
const totalWeight = weighted.reduce((sum, [, weight]) => sum + weight, 0n);
if (totalWeight === 0n) throw new Error("No eligible token-holder balance was found during the selected epoch.");
const allocations = weighted.map(([address, weight]) => ({
  address,
  weight,
  rewardWei: (rewardBudget * weight) / totalWeight,
}));
let distributed = allocations.reduce((sum, item) => sum + item.rewardWei, 0n);
const remainder = rewardBudget - distributed;
if (remainder > 0n) {
  const largest = allocations.reduce((best, item, index, all) => item.weight > all[best].weight ? index : best, 0);
  allocations[largest].rewardWei += remainder;
  distributed += remainder;
}
const holders = allocations
  .filter((item) => item.rewardWei > 0n)
  .map((item) => ({ address: item.address, amountWei: item.rewardWei.toString(), amountEth: formatEther(item.rewardWei) }));
const [start, end] = await Promise.all([provider.getBlock(startBlock), provider.getBlock(endBlock)]);
if (!start || !end) throw new Error("Could not retrieve timestamps for the requested snapshot blocks.");
const output = {
  snapshot: {
    chainId: Number(network.chainId),
    tokenAddress: token,
    deploymentBlock,
    blockNumber: endBlock,
    startBlock,
    endBlock,
    timestamp: new Date(end.timestamp * 1000).toISOString(),
    startTimestamp: new Date(start.timestamp * 1000).toISOString(),
    endTimestamp: new Date(end.timestamp * 1000).toISOString(),
    source: "Robinhood Chain RPC Transfer-event reconstruction",
    eligibilityPolicy: "All non-zero holders weighted by balance multiplied by blocks held during the epoch; no address exclusions.",
    tokenDecimals: decimals,
    transferEventsIndexed: totalLogs,
    totalWeightedTokenBlocks: totalWeight.toString(),
  },
  holders,
};
const outputPath = path.resolve(process.cwd(), "holder-snapshot-" + startBlock + "-" + endBlock + ".json");
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify({
  outputPath,
  holders: holders.length,
  rewardBudgetETH: rewardEthArg,
  distributedWei: distributed.toString(),
  snapshot: output.snapshot,
}, null, 2));
