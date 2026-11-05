import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  Contract, JsonRpcProvider, Wallet, getAddress, isAddress,
} from "ethers";

const RPC_URL = process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const CONFIRM = process.env.CONFIRM_FLASHBOYS_MAINNET_DEPLOYMENT;
if (!PRIVATE_KEY) throw new Error("Set DEPLOYER_PRIVATE_KEY in your local shell. Never put it in Vercel or commit it.");
if (CONFIRM !== "YES") throw new Error("This deploys contracts on Robinhood Chain mainnet. Set CONFIRM_FLASHBOYS_MAINNET_DEPLOYMENT=YES only after reviewing the deployment plan.");

const provider = new JsonRpcProvider(RPC_URL);
const network = await provider.getNetwork();
if (network.chainId !== 4663n) throw new Error("Wrong network. Expected Robinhood Chain mainnet (4663).");
const signer = new Wallet(PRIVATE_KEY, provider);
const creator = await signer.getAddress();
const balance = await provider.getBalance(creator);
if (balance === 0n) throw new Error("The deployer wallet has no ETH for deployment gas.");

const generated = (name) => JSON.parse(readFileSync(resolve("src/generated", name + ".json"), "utf8"));
const factoryArtifact = generated("FlashboysFactory");
const adapterArtifact = generated("FlashboysUniswapV3GraduationAdapter");

async function deploy(label, artifact, args = []) {
  const { ContractFactory } = await import("ethers");
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, signer);
  const gas = await factory.getDeployTransaction(...args);
  const estimate = await provider.estimateGas({ ...gas, from: creator });
  console.log(label + " estimated gas: " + estimate.toString());
  const instance = await factory.deploy(...args, { gasLimit: estimate * 120n / 100n });
  console.log(label + " transaction: " + instance.deploymentTransaction().hash);
  await instance.waitForDeployment();
  const address = await instance.getAddress();
  console.log(label + " deployed: " + address);
  return new Contract(address, artifact.abi, signer);
}

console.log("Network: Robinhood Chain (4663)");
console.log("Creator: " + creator);
console.log("Available ETH: " + (Number(balance) / 1e18).toFixed(6));
console.log("Deploying independent FLASHBOYS factory and Uniswap V3 adapter…");

const factory = await deploy("FLASHBOYS Factory", factoryArtifact, [creator]);
const adapter = await deploy("FLASHBOYS Uniswap V3 Graduation Adapter", adapterArtifact, [await factory.getAddress()]);
const setTx = await factory.setGraduationAdapter(await adapter.getAddress());
console.log("Factory adapter configuration transaction: " + setTx.hash);
await setTx.wait();

const [configuredAdapter, routerAddress, factoryCreator] = await Promise.all([
  factory.graduationAdapter(), factory.feeRouter(), factory.creator(),
]);
const router = new Contract(routerAddress, [
  "function feeCollector(address) view returns (bool)",
  "function holderRewardsVault() view returns (address)",
], provider);
const [authorized, holderVault] = await Promise.all([
  router.feeCollector(await adapter.getAddress()),
  router.holderRewardsVault(),
]);
if (getAddress(configuredAdapter) !== getAddress(await adapter.getAddress())) throw new Error("Factory adapter verification failed.");
if (!authorized) throw new Error("Adapter is not authorized to collect fees in the FLASHBOYS router.");
if (getAddress(factoryCreator) !== getAddress(creator)) throw new Error("Factory creator verification failed.");

const output = {
  chainId: 4663,
  creator,
  factory: await factory.getAddress(),
  graduationAdapter: await adapter.getAddress(),
  feeRouter: routerAddress,
  holderRewardsVault: holderVault,
  verified: { adapterConfigured: true, adapterAuthorizedAsFeeCollector: true, creatorMatchesDeployer: true },
  frontendEnvironmentVariable: "VITE_FLASHBOYS_FACTORY_ADDRESS=" + await factory.getAddress(),
};
console.log("\nDEPLOYMENT SUMMARY\n" + JSON.stringify(output, null, 2));
