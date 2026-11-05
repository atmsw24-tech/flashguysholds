import fs from "node:fs";
import solc from "solc";

const contracts = [
  { sourcePath: "../contracts/RobinhoodFixedSupplyToken.sol", sourceName: "RobinhoodFixedSupplyToken.sol", contractName: "RobinhoodFixedSupplyToken" },
  { sourcePath: "../contracts/FlashboysHolderRewardsVault.sol", sourceName: "FlashboysHolderRewardsVault.sol", contractName: "FlashboysHolderRewardsVault" },
  { sourcePath: "../contracts/FlashboysFeeRouter.sol", sourceName: "FlashboysFeeRouter.sol", contractName: "FlashboysFeeRouter" },
  { sourcePath: "../contracts/FlashboysBondingCurve.sol", sourceName: "FlashboysBondingCurve.sol", contractName: "FlashboysBondingCurve" },
  { sourcePath: "../contracts/FlashboysPostGraduationFeeCollector.sol", sourceName: "FlashboysPostGraduationFeeCollector.sol", contractName: "FlashboysPostGraduationFeeCollector" },
  { sourcePath: "../contracts/FlashboysFactory.sol", sourceName: "FlashboysFactory.sol", contractName: "FlashboysFactory" },
  { sourcePath: "../contracts/RobinhoodCreatorFeeSplitter.sol", sourceName: "RobinhoodCreatorFeeSplitter.sol", contractName: "FlashboysPonsFeeSplitter" },
];
const sources = Object.fromEntries(contracts.map(({ sourcePath, sourceName }) => [
  sourceName,
  { content: fs.readFileSync(new URL(sourcePath, import.meta.url), "utf8") },
]));
const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors || []).filter((entry) => entry.severity === "error");
if (errors.length) {
  for (const error of errors) console.error(error.formattedMessage);
  process.exit(1);
}
const dir = new URL("../src/generated/", import.meta.url);
fs.mkdirSync(dir, { recursive: true });
for (const { sourceName, contractName } of contracts) {
  const compiled = output.contracts?.[sourceName]?.[contractName];
  if (!compiled?.evm?.bytecode?.object) throw new Error(`Solidity compiler produced no bytecode for ${contractName}.`);
  const artifact = { contractName, abi: compiled.abi, bytecode: "0x" + compiled.evm.bytecode.object };
  fs.writeFileSync(new URL(`${contractName}.json`, dir), JSON.stringify(artifact, null, 2));
  console.log(`Compiled ${contractName} artifact.`);
}
