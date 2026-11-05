import fs from "node:fs";
import solc from "solc";
const source = fs.readFileSync(new URL("../contracts/RobinhoodFixedSupplyToken.sol", import.meta.url), "utf8");
const input = { language: "Solidity", sources: { "RobinhoodFixedSupplyToken.sol": { content: source } }, settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } } };
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors || []).filter((entry) => entry.severity === "error");
if (errors.length) { for (const error of errors) console.error(error.formattedMessage); process.exit(1); }
const compiled = output.contracts?.["RobinhoodFixedSupplyToken.sol"]?.RobinhoodFixedSupplyToken;
if (!compiled?.evm?.bytecode?.object) throw new Error("Solidity compiler produced no deployment bytecode.");
const artifact = { contractName: "RobinhoodFixedSupplyToken", abi: compiled.abi, bytecode: "0x" + compiled.evm.bytecode.object };
const dir = new URL("../src/generated/", import.meta.url); fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(new URL("RobinhoodFixedSupplyToken.json", dir), JSON.stringify(artifact, null, 2));
console.log("Compiled fixed-supply Robinhood Chain token artifact.");