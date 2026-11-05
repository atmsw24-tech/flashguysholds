import { BrowserProvider, ContractFactory } from "ethers";
import artifact from "./generated/RobinhoodFixedSupplyToken.json";
export const ROBINHOOD_TESTNET = { chainId: 46630, chainIdHex: "0xb626", chainName: "Robinhood Chain Testnet", rpcUrls: ["https://rpc.testnet.chain.robinhood.com"], blockExplorerUrls: ["https://explorer.testnet.chain.robinhood.com"], nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 } };
export async function deployRobinhoodFixedSupplyToken({ ethereum, name, symbol, onStatus }) {
  if (!ethereum?.request) throw new Error("Install MetaMask or Robinhood Wallet to deploy on Robinhood Chain Testnet.");
  if (!String(name || "").trim() || !String(symbol || "").trim()) throw new Error("Token name and ticker are required.");
  try { await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ROBINHOOD_TESTNET.chainIdHex }] }); }
  catch (error) { if (error?.code !== 4902) throw error; await ethereum.request({ method: "wallet_addEthereumChain", params: [ROBINHOOD_TESTNET] }); }
  const chainId = Number(BigInt(await ethereum.request({ method: "eth_chainId" })));
  if (chainId !== ROBINHOOD_TESTNET.chainId) throw new Error("Wrong network. Switch to Robinhood Chain Testnet (46630). Mainnet deployment is disabled in this test flow.");
  const provider = new BrowserProvider(ethereum); const signer = await provider.getSigner();
  onStatus?.("Approve fixed-supply contract deployment in your wallet.");
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, signer);
  const contract = await factory.deploy(String(name).trim(), String(symbol).trim().toUpperCase()); await contract.waitForDeployment();
  const address = await contract.getAddress(); const [supply, balance, decimals] = await Promise.all([contract.totalSupply(), contract.balanceOf(await signer.getAddress()), contract.decimals()]);
  const expected = 1_000_000_000n * 10n ** 18n;
  if (supply !== expected || balance !== expected || decimals !== 18n) throw new Error("On-chain verification failed: total supply/deployer balance is not exactly 1 billion.");
  return { network: "Robinhood Chain Testnet", address, transactionHash: contract.deploymentTransaction()?.hash || "", supply: "1000000000", decimals: 18, mintFunction: "not present", explorerUrl: ROBINHOOD_TESTNET.blockExplorerUrls[0] + "/address/" + address };
}