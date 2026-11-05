import { BrowserProvider, Contract, ZeroAddress, getAddress, parseEther } from "ethers";

export const ROBINHOOD_CHAIN = {
  chainId: 4663,
  chainIdHex: "0x1237",
  chainName: "Robinhood Chain",
  rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
  blockExplorerUrls: ["https://robinhoodchain.blockscout.com"],
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
};

const FACTORY_ADDRESS = String(import.meta.env.VITE_FLASHBOYS_FACTORY_ADDRESS || "").trim();
const ZERO = ZeroAddress;
const FACTORY_ABI = [
  "function creator() view returns (address)",
  "function feeRouter() view returns (address)",
  "function graduationAdapter() view returns (address)",
  "function feeBps() view returns (uint16)",
  "function graduationThreshold() view returns (uint256)",
  "function virtualEthReserve() view returns (uint256)",
  "function createToken(string name_,string symbol_) returns (address tokenAddress,address curveAddress,address collectorAddress)",
  "event TokenCreated(address indexed creator,address indexed token,address indexed curve,address feeCollector,string name,string symbol)",
];
const ROUTER_ABI = ["function holderRewardsVault() view returns (address)"];
const VAULT_ABI = [
  "function publishRoot(uint256 epoch,address asset,bytes32 root,uint256 totalAllocation)",
  "function claim(uint256 epoch,address asset,uint256 amount,bytes32[] proof)",
];

async function switchToRobinhood(ethereum) {
  if (!ethereum?.request) throw new Error("Install Robinhood Wallet or MetaMask first.");
  try {
    await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ROBINHOOD_CHAIN.chainIdHex }] });
  } catch (error) {
    if (error?.code !== 4902) throw error;
    await ethereum.request({ method: "wallet_addEthereumChain", params: [ROBINHOOD_CHAIN] });
    await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ROBINHOOD_CHAIN.chainIdHex }] });
  }
  const chainId = Number(BigInt(await ethereum.request({ method: "eth_chainId" })));
  if (chainId !== ROBINHOOD_CHAIN.chainId) throw new Error("Switch your wallet to Robinhood Chain mainnet (4663).");
}

export async function readFlashboysFactoryStatus({ ethereum, walletAddress } = {}) {
  if (!FACTORY_ADDRESS || !/^0x[a-fA-F0-9]{40}$/.test(FACTORY_ADDRESS)) {
    return { ready: false, factoryAddress: "", message: "VITE_FLASHBOYS_FACTORY_ADDRESS is not configured. Deploy the independent FLASHBOYS factory, then add its address to Vercel and redeploy." };
  }
  if (!ethereum?.request) return { ready: false, factoryAddress: FACTORY_ADDRESS, message: "Connect an EVM wallet to inspect the FLASHBOYS factory." };
  await switchToRobinhood(ethereum);
  const provider = new BrowserProvider(ethereum);
  const code = await provider.getCode(FACTORY_ADDRESS);
  if (!code || code === "0x") return { ready: false, factoryAddress: FACTORY_ADDRESS, message: "No contract code exists at the configured factory address on Robinhood Chain. Check the address and deployment." };
  const factory = new Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
  const [creator, feeRouter, graduationAdapter, feeBps, graduationThreshold, virtualEthReserve] = await Promise.all([
    factory.creator(), factory.feeRouter(), factory.graduationAdapter(), factory.feeBps(),
    factory.graduationThreshold(), factory.virtualEthReserve(),
  ]);
  const routerCode = await provider.getCode(feeRouter);
  if (!routerCode || routerCode === "0x") throw new Error("The factory's fee router has no deployed contract code.");
  const router = new Contract(feeRouter, ROUTER_ABI, provider);
  const holderVault = await router.holderRewardsVault();
  const adapterCode = graduationAdapter === ZERO ? "0x" : await provider.getCode(graduationAdapter);
  const isCreator = Boolean(walletAddress) && creator.toLowerCase() === String(walletAddress).toLowerCase();
  const adapterReady = graduationAdapter !== ZERO && adapterCode !== "0x";
  const ready = isCreator && adapterReady;
  let message = "Factory deployed, but ";
  if (!isCreator) message += "the connected wallet is not the factory creator. Connect the creator wallet.";
  else if (!adapterReady) message += "a deployed graduation adapter has not been configured. Launches are blocked.";
  else message = "Factory, creator wallet, fee router, holder vault, and graduation adapter are configured. This is a configuration check, not an end-to-end launch test.";
  return {
    ready, factoryAddress: FACTORY_ADDRESS, creator, feeRouter, holderVault, graduationAdapter,
    feeBps: Number(feeBps), graduationThresholdEth: (Number(graduationThreshold) / 1e18).toString(),
    virtualEthReserveEth: (Number(virtualEthReserve) / 1e18).toString(), message,
  };
}

export async function launchOnFlashboysFactory({ ethereum, walletAddress, name, symbol, onStatus }) {
  if (!String(name || "").trim() || !String(symbol || "").trim()) throw new Error("Token name and ticker are required.");
  await switchToRobinhood(ethereum);
  const provider = new BrowserProvider(ethereum);
  const signer = await provider.getSigner();
  const creator = await signer.getAddress();
  if (walletAddress && creator.toLowerCase() !== String(walletAddress).toLowerCase()) throw new Error("The connected wallet changed. Reconnect and try again.");
  const status = await readFlashboysFactoryStatus({ ethereum, walletAddress: creator });
  if (!status.ready) throw new Error(status.message || "FLASHBOYS factory is not ready.");
  const factory = new Contract(FACTORY_ADDRESS, FACTORY_ABI, signer);
  onStatus?.("Checking your independent FLASHBOYS factory and estimating the launch transaction…");
  await factory.createToken.staticCall(String(name).trim(), String(symbol).trim().toUpperCase());
  onStatus?.("Confirm the FLASHBOYS factory token-creation transaction in your wallet. ETH is required for gas.");
  const tx = await factory.createToken(String(name).trim(), String(symbol).trim().toUpperCase());
  const receipt = await tx.wait();
  let created = null;
  for (const log of receipt.logs) {
    try {
      const parsed = factory.interface.parseLog(log);
      if (parsed?.name === "TokenCreated") { created = parsed; break; }
    } catch {}
  }
  if (!created) throw new Error("Transaction confirmed, but the FLASHBOYS TokenCreated event was not found. Check Blockscout before retrying.");
  const token = created.args.token;
  const curve = created.args.curve;
  const collector = created.args.feeCollector;
  return {
    protocol: "FLASHBOYS Factory", network: "Robinhood Chain Mainnet", address: token, curve,
    collector, feeRouter: status.feeRouter, holderVault: status.holderVault, creator,
    feeBps: status.feeBps, supply: "1000000000", decimals: 18, transactionHash: receipt.hash,
    explorerUrl: ROBINHOOD_CHAIN.blockExplorerUrls[0] + "/token/" + token,
    curveExplorerUrl: ROBINHOOD_CHAIN.blockExplorerUrls[0] + "/address/" + curve,
    routerExplorerUrl: ROBINHOOD_CHAIN.blockExplorerUrls[0] + "/address/" + status.feeRouter,
  };
}

export async function publishFlashboysHolderRewardsRoot({ ethereum, holderVault, epoch, root, totalAllocationEth, asset = ZERO }) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(String(root || ""))) throw new Error("Enter a valid 32-byte Merkle root.");
  const epochNumber = Number(epoch);
  if (!Number.isSafeInteger(epochNumber) || epochNumber < 1) throw new Error("Reward epoch must be a positive whole number.");
  const allocation = parseEther(String(totalAllocationEth || ""));
  if (allocation <= 0n) throw new Error("Enter a positive ETH allocation.");
  await switchToRobinhood(ethereum);
  const signer = await new BrowserProvider(ethereum).getSigner();
  const vault = new Contract(holderVault, VAULT_ABI, signer);
  const tx = await vault.publishRoot(epochNumber, getAddress(asset), root, allocation);
  const receipt = await tx.wait();
  return { transactionHash: receipt.hash };
}

export async function claimFlashboysHolderReward({ ethereum, holderVault, epoch, amountEth, proof, asset = ZERO }) {
  const proofItems = typeof proof === "string" ? JSON.parse(proof) : proof;
  if (!Array.isArray(proofItems) || proofItems.some((item) => !/^0x[a-fA-F0-9]{64}$/.test(String(item)))) {
    throw new Error("Merkle proof must be a JSON array of 32-byte hex hashes.");
  }
  const epochNumber = Number(epoch);
  if (!Number.isSafeInteger(epochNumber) || epochNumber < 1) throw new Error("Reward epoch must be a positive whole number.");
  const amount = parseEther(String(amountEth || ""));
  if (amount <= 0n) throw new Error("Enter a positive ETH claim amount.");
  await switchToRobinhood(ethereum);
  const signer = await new BrowserProvider(ethereum).getSigner();
  const vault = new Contract(holderVault, VAULT_ABI, signer);
  const tx = await vault.claim(epochNumber, getAddress(asset), amount, proofItems);
  const receipt = await tx.wait();
  return { transactionHash: receipt.hash };
}
