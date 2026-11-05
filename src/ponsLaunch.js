import { BrowserProvider, Contract, ContractFactory, ZeroAddress, id } from "ethers";
import splitterArtifact from "./generated/FlashboysPonsFeeSplitter.json";

export const ROBINHOOD_MAINNET = {
  chainId: 4663,
  chainIdHex: "0x1237",
  chainName: "Robinhood Chain",
  rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
  blockExplorerUrls: ["https://robinhoodchain.blockscout.com"],
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
};

export const PONS_V2_FACTORY = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e";

const FACTORY_ABI = [
  "function launchConfigCount() view returns (uint256)",
  "function getLaunchConfig(uint256) view returns (tuple(uint256 supply,uint256 curveFeeBps,uint256 phantomQuote,uint256 graduationThreshold,uint24 poolFee,int24 tickSpacing,bool enabled))",
  "function launchFee() view returns (uint256)",
  "function launchEnabled() view returns (bool)",
  "function snipeTaxStartBps() view returns (uint256)",
  "function snipeTaxSeconds() view returns (uint256)",
  "function canLaunch(address) view returns (bool)",
  "function memeHook() view returns (address)",
  "function feeEscrow() view returns (address)",
  "function previewLaunchEconomics(uint256,address) view returns (bytes32)",
  "function maxCreatorTaxBps() view returns (uint256)",
  "function launchToken((string name,string symbol,string logo,string description,(string twitter,string telegram,string discord,string website,string farcaster) socials,address creatorFeeRecipient,uint16 creatorTaxBps,bool buybackEnabled,bytes32 expectedEconomics,bytes32 salt) params,uint256 launchConfigId,address pairToken) payable returns (address token,address curve)",
  "event TokenLaunched(address indexed token,address indexed curve,address indexed deployer,address pairToken,uint256 launchConfigId,uint256 graduationThreshold)",
];
const HOOK_ABI = [
  "function currentFeePolicy() view returns (tuple(address protocolFeeRecipient,uint16 protocolFeeShareBps,uint16 buybackBurnBps,uint16 hookFeeBps,uint16 maxInternalPriceImpactBps))",
];
const ESCROW_ABI = [
  "function balanceOf(address recipient) view returns (uint256)",
  "function balanceOfToken(address recipient,address token) view returns (uint256)",
];

async function switchToRobinhoodMainnet(ethereum) {
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ROBINHOOD_MAINNET.chainIdHex }],
    });
  } catch (error) {
    if (error?.code !== 4902) throw error;
    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [ROBINHOOD_MAINNET],
    });
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ROBINHOOD_MAINNET.chainIdHex }],
    });
  }
  const chainId = Number(BigInt(await ethereum.request({ method: "eth_chainId" })));
  if (chainId !== ROBINHOOD_MAINNET.chainId) throw new Error("Wallet is not connected to Robinhood Chain mainnet (4663).");
}

export async function readPonsLaunchOptions(ethereum) {
  if (!ethereum?.request) throw new Error("Connect an EVM wallet to inspect Pons launch settings.");
  const provider = new BrowserProvider(ethereum);
  const factory = new Contract(PONS_V2_FACTORY, FACTORY_ABI, provider);
  const [count, launchFee, launchEnabled, hookAddress, feeEscrow, snipeTaxStartBps, snipeTaxSeconds] = await Promise.all([
    factory.launchConfigCount(),
    factory.launchFee(),
    factory.launchEnabled(),
    factory.memeHook(),
    factory.feeEscrow(),
    factory.snipeTaxStartBps(),
    factory.snipeTaxSeconds(),
  ]);
  const configs = await Promise.all(
    Array.from({ length: Number(count) }, (_, index) => factory.getLaunchConfig(index))
  );
  const hook = new Contract(hookAddress, HOOK_ABI, provider);
  const policy = await hook.currentFeePolicy();
  const enabledConfigs = configs
    .map((config, index) => ({
      id: index,
      supply: config.supply.toString(),
      curveFeeBps: Number(config.curveFeeBps),
      phantomQuote: config.phantomQuote.toString(),
      graduationThreshold: config.graduationThreshold.toString(),
      poolFee: Number(config.poolFee),
      tickSpacing: Number(config.tickSpacing),
      enabled: Boolean(config.enabled),
    }))
    .filter((config) => config.enabled);
  return {
    factory: PONS_V2_FACTORY,
    launchFeeWei: launchFee.toString(),
    launchFeeEth: (Number(launchFee) / 1e18).toString(),
    launchEnabled: Boolean(launchEnabled),
    feeEscrow,
    protocolFeeShareBps: Number(policy.protocolFeeShareBps),
    buybackBurnBps: Number(policy.buybackBurnBps),
    hookFeeBps: Number(policy.hookFeeBps),
    snipeTaxStartBps: Number(snipeTaxStartBps),
    snipeTaxSeconds: Number(snipeTaxSeconds),
    configs: enabledConfigs,
  };
}

export async function launchOnPons({
  ethereum, name, symbol, description, logo,
  website, twitter, telegram, launchConfigId = 0, onStatus,
}) {
  if (!ethereum?.request) throw new Error("Install Robinhood Wallet or MetaMask first.");
  if (!String(name || "").trim() || !String(symbol || "").trim()) throw new Error("Token name and ticker are required.");
  await switchToRobinhoodMainnet(ethereum);

  const provider = new BrowserProvider(ethereum);
  const signer = await provider.getSigner();
  const creator = await signer.getAddress();
  const factory = new Contract(PONS_V2_FACTORY, FACTORY_ABI, signer);

  onStatus?.("Checking Pons V2 factory, live launch configuration, and fee policy…");
  const [canLaunch, launchEnabled, configCount, launchFee, feeEscrow, hookAddress] = await Promise.all([
    factory.canLaunch(creator),
    factory.launchEnabled(),
    factory.launchConfigCount(),
    factory.launchFee(),
    factory.feeEscrow(),
    factory.memeHook(),
  ]);
  if (!canLaunch) throw new Error("Pons currently does not allow this wallet to launch. The factory launch gate or allowlist is closed.");
  const configId = Number(launchConfigId);
  if (!Number.isInteger(configId) || configId < 0 || BigInt(configId) >= configCount) throw new Error("Select a valid, currently available Pons launch configuration.");
  const config = await factory.getLaunchConfig(configId);
  if (!config.enabled) throw new Error("That Pons launch configuration is disabled. Refresh launch settings.");
  const expectedSupply = 1_000_000_000n * 10n ** 18n;
  if (config.supply !== expectedSupply) throw new Error("The selected Pons configuration does not use the required fixed 1,000,000,000-token supply. No launch was submitted.");

  const hook = new Contract(hookAddress, HOOK_ABI, provider);
  const policy = await hook.currentFeePolicy();
  const protocolShare = Number(policy.protocolFeeShareBps);
  const economics = await factory.previewLaunchEconomics(configId, ZeroAddress);

  onStatus?.("Deploying the FLASHBOYS creator-fee splitter and holder-rewards vault. Confirm the contract deployment in your wallet.");
  const splitterFactory = new ContractFactory(splitterArtifact.abi, splitterArtifact.bytecode, signer);
  const splitter = await splitterFactory.deploy(creator);
  await splitter.waitForDeployment();
  const splitterAddress = await splitter.getAddress();
  const holderVault = await splitter.holderRewardsVault();

  const salt = id([
    creator.toLowerCase(), Date.now().toString(),
    String(name).trim(), String(symbol).trim().toUpperCase(),
  ].join(":"));
  const params = {
    name: String(name).trim(),
    symbol: String(symbol).trim().toUpperCase(),
    logo: String(logo || ""),
    description: String(description || ""),
    socials: {
      twitter: String(twitter || ""),
      telegram: String(telegram || ""),
      discord: "",
      website: String(website || ""),
      farcaster: "",
    },
    creatorFeeRecipient: splitterAddress,
    creatorTaxBps: 0,
    buybackEnabled: false,
    expectedEconomics: economics,
    salt,
  };

  onStatus?.("Splitter deployed. Submit the Pons V2 token launch and pay the factory's displayed launch fee in ETH. Confirm the transaction in your wallet.");
  let tx;
  try {
    tx = await factory.launchToken(params, configId, ZeroAddress, { value: launchFee });
    const receipt = await tx.wait();
    let launched;
    for (const log of receipt.logs) {
      try {
        const parsed = factory.interface.parseLog(log);
        if (parsed?.name === "TokenLaunched") { launched = parsed; break; }
      } catch {}
    }
    if (!launched) throw new Error("Pons launch transaction confirmed, but the TokenLaunched event was not found. Check the transaction on Blockscout before retrying.");
    return {
      protocol: "Pons V2",
      network: "Robinhood Chain Mainnet",
      address: launched.args.token,
      curve: launched.args.curve,
      splitter: splitterAddress,
      holderVault,
      creator,
      transactionHash: receipt.hash,
      supply: "1000000000",
      decimals: 18,
      protocolFeeShareBps: protocolShare,
      holderShareOfCreatorBps: 2000,
      creatorShareOfCreatorBps: 8000,
      feeEscrow,
      launchFeeWei: launchFee.toString(),
      explorerUrl: ROBINHOOD_MAINNET.blockExplorerUrls[0] + "/address/" + launched.args.token,
      splitterExplorerUrl: ROBINHOOD_MAINNET.blockExplorerUrls[0] + "/address/" + splitterAddress,
    };
  } catch (error) {
    error.message = (error?.shortMessage || error?.message || "Pons launch failed.") +
      " The fee splitter was already deployed at " + splitterAddress +
      ". Reuse this address for a retry rather than deploying another splitter.";
    error.splitterAddress = splitterAddress;
    throw error;
  }
}

export async function claimPonsCreatorFees({ ethereum, splitterAddress, feeEscrow }) {
  if (!ethereum?.request) throw new Error("Connect the creator wallet first.");
  await switchToRobinhoodMainnet(ethereum);
  const provider = new BrowserProvider(ethereum);
  const signer = await provider.getSigner();
  const escrow = new Contract(feeEscrow, ESCROW_ABI, provider);
  const [nativeBalance] = await Promise.all([escrow.balanceOf(splitterAddress)]);
  if (nativeBalance === 0n) throw new Error("No native creator fees are currently claimable.");
  const splitterAbi = [
    "function claimAndDistributeNative(address escrow)",
  ];
  const splitter = new Contract(splitterAddress, splitterAbi, signer);
  const tx = await splitter.claimAndDistributeNative(feeEscrow);
  const receipt = await tx.wait();
  return { transactionHash: receipt.hash, amountWei: nativeBalance.toString() };
}

export async function publishPonsHolderRewardsRoot({ ethereum, holderVault, epoch, root }) {
  if (!ethereum?.request) throw new Error("Connect the creator wallet first.");
  await switchToRobinhoodMainnet(ethereum);
  if (!/^0x[a-fA-F0-9]{64}$/.test(String(root || ""))) throw new Error("Enter a valid 32-byte Merkle root.");
  const provider = new BrowserProvider(ethereum);
  const signer = await provider.getSigner();
  const vault = new Contract(holderVault, ["function publishRoot(uint256 epoch,address asset,bytes32 root)"], signer);
  const tx = await vault.publishRoot(BigInt(epoch), ZeroAddress, root);
  const receipt = await tx.wait();
  return { transactionHash: receipt.hash };
}

export async function claimPonsHolderReward({ ethereum, holderVault, epoch, amountEth, proof }) {
  if (!ethereum?.request) throw new Error("Connect a Robinhood Chain wallet first.");
  await switchToRobinhoodMainnet(ethereum);
  const proofItems = typeof proof === "string" ? JSON.parse(proof) : proof;
  if (!Array.isArray(proofItems) || proofItems.some((item) => !/^0x[a-fA-F0-9]{64}$/.test(String(item)))) {
    throw new Error("Merkle proof must be a JSON array of 32-byte hex hashes.");
  }
  const { parseEther } = await import("ethers");
  const provider = new BrowserProvider(ethereum);
  const signer = await provider.getSigner();
  const vault = new Contract(holderVault, ["function claim(uint256 epoch,address asset,uint256 amount,bytes32[] proof)"], signer);
  const tx = await vault.claim(BigInt(epoch), ZeroAddress, parseEther(String(amountEth)), proofItems);
  const receipt = await tx.wait();
  return { transactionHash: receipt.hash };
}
