import { Contract, JsonRpcProvider, getAddress } from "ethers";

const factoryAddress = process.env.VITE_FLASHBOYS_FACTORY_ADDRESS;
if (!factoryAddress) throw new Error("Set VITE_FLASHBOYS_FACTORY_ADDRESS to the deployed factory address.");
const rpc = new JsonRpcProvider(process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com");
const network = await rpc.getNetwork();
if (network.chainId !== 4663n) throw new Error("Expected Robinhood Chain mainnet (4663).");
if (!(await rpc.getCode(factoryAddress)).length || await rpc.getCode(factoryAddress) === "0x") {
  throw new Error("No factory bytecode at VITE_FLASHBOYS_FACTORY_ADDRESS.");
}
const factory = new Contract(factoryAddress, [
  "function creator() view returns(address)",
  "function feeRouter() view returns(address)",
  "function graduationAdapter() view returns(address)",
  "function feeBps() view returns(uint16)",
  "function graduationThreshold() view returns(uint256)",
  "function virtualEthReserve() view returns(uint256)",
  "function tokenCount() view returns(uint256)",
], rpc);
const [creator, routerAddress, adapterAddress, feeBps, threshold, virtualReserve, tokenCount] = await Promise.all([
  factory.creator(), factory.feeRouter(), factory.graduationAdapter(), factory.feeBps(),
  factory.graduationThreshold(), factory.virtualEthReserve(), factory.tokenCount(),
]);
for (const [label, address] of [["router", routerAddress], ["adapter", adapterAddress]]) {
  if (address === "0x0000000000000000000000000000000000000000" || await rpc.getCode(address) === "0x") {
    throw new Error("Missing deployed " + label + " contract.");
  }
}
const router = new Contract(routerAddress, [
  "function CREATOR_BPS() view returns(uint256)",
  "function HOLDER_REWARDS_BPS() view returns(uint256)",
  "function holderRewardsVault() view returns(address)",
  "function feeCollector(address) view returns(bool)",
], rpc);
const [creatorBps, holderBps, vault, authorized] = await Promise.all([
  router.CREATOR_BPS(), router.HOLDER_REWARDS_BPS(), router.holderRewardsVault(), router.feeCollector(adapterAddress),
]);
if (creatorBps !== 6000n || holderBps !== 4000n) throw new Error("Router fee split is not 60/40.");
if (!authorized) throw new Error("Graduation adapter is not authorized to forward post-graduation fees.");
const adapter = new Contract(adapterAddress, [
  "function POSITION_MANAGER() view returns(address)",
  "function WETH() view returns(address)",
  "function POOL_FEE() view returns(uint24)",
], rpc);
const [positionManager, weth, poolFee] = await Promise.all([
  adapter.POSITION_MANAGER(), adapter.WETH(), adapter.POOL_FEE(),
]);
for (const [label, address] of [["Uniswap V3 position manager", positionManager], ["WETH", weth]]) {
  if (await rpc.getCode(address) === "0x") throw new Error(label + " has no deployed bytecode at " + address);
}
const result = {
  chainId: 4663,
  factory: getAddress(factoryAddress),
  creator: getAddress(creator),
  feeRouter: getAddress(routerAddress),
  graduationAdapter: getAddress(adapterAddress),
  holderRewardsVault: getAddress(vault),
  feeSplit: { creatorBps: Number(creatorBps), holderBps: Number(holderBps) },
  tradingFeeBps: Number(feeBps),
  graduationThresholdWei: threshold.toString(),
  virtualEthReserveWei: virtualReserve.toString(),
  createdTokenCount: tokenCount.toString(),
  adapterAuthorized: authorized,
  uniswapV3: { positionManager, weth, poolFee: Number(poolFee) },
  note: "Configuration verified only. This does not prove token graduation, swaps, LP fee accrual, harvesting, or holder claims.",
};
console.log(JSON.stringify(result, null, 2));
