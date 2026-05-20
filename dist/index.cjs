#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/tsup/assets/cjs_shims.js
var init_cjs_shims = __esm({
  "node_modules/tsup/assets/cjs_shims.js"() {
    "use strict";
  }
});

// src/core/config.ts
var config_exports = {};
__export(config_exports, {
  loadConfig: () => loadConfig,
  saveConfig: () => saveConfig
});
function loadConfig() {
  const config = {};
  if ((0, import_fs.existsSync)(CONFIG_FILE)) {
    try {
      const raw = (0, import_fs.readFileSync)(CONFIG_FILE, "utf-8");
      Object.assign(config, JSON.parse(raw));
    } catch {
    }
  }
  if (process.env.ETHERSCAN_API_KEY) {
    config.etherscanApiKey = process.env.ETHERSCAN_API_KEY;
  }
  return config;
}
function saveConfig(config) {
  if (!(0, import_fs.existsSync)(CONFIG_DIR)) {
    (0, import_fs.mkdirSync)(CONFIG_DIR, { recursive: true });
  }
  (0, import_fs.writeFileSync)(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}
var import_fs, import_os, import_path, CONFIG_DIR, CONFIG_FILE;
var init_config = __esm({
  "src/core/config.ts"() {
    "use strict";
    init_cjs_shims();
    import_fs = require("fs");
    import_os = require("os");
    import_path = require("path");
    CONFIG_DIR = (0, import_path.join)((0, import_os.homedir)(), ".unfold");
    CONFIG_FILE = (0, import_path.join)(CONFIG_DIR, "config.json");
  }
});

// src/index.ts
init_cjs_shims();
var import_commander = require("commander");

// src/output/banner.ts
init_cjs_shims();
var import_chalk2 = __toESM(require("chalk"));

// src/output/colors.ts
init_cjs_shims();
var import_chalk = __toESM(require("chalk"));
var c = {
  success: import_chalk.default.hex("#4ec994"),
  warn: import_chalk.default.hex("#f5c842"),
  danger: import_chalk.default.hex("#f07070"),
  address: import_chalk.default.hex("#56d4d4"),
  bold: import_chalk.default.white.bold,
  muted: import_chalk.default.hex("#888888"),
  dim: import_chalk.default.hex("#555555")
};

// src/output/banner.ts
function printBanner() {
  const art = import_chalk2.default.hex("#56d4d4")(`
 _   _        __      _     _
| | | |_ __  / _|___ | | __| |
| | | | '_ \\| |_/ _ \\| |/ _\` |
| |_| | | | |  _| (_) | | (_| |
 \\___/|_| |_|_|  \\___/|_|\\__,_|
`);
  console.log(art);
  console.log(`  ${c.muted("contract explorer")} ${c.bold("v0.1.0")}`);
  console.log(`  ${c.dim("by alva-p \xB7 github.com/alv-arez/unfold")}`);
  console.log();
}

// src/commands/inspect.ts
init_cjs_shims();
var import_ora = __toESM(require("ora"));
var import_viem3 = require("viem");

// src/core/resolver.ts
init_cjs_shims();

// src/core/rpc.ts
init_cjs_shims();
var import_viem = require("viem");
var import_chains = require("viem/chains");
var CHAINS = {
  mainnet: {
    name: "Ethereum mainnet",
    chainId: 1,
    explorerApiUrl: "https://api.etherscan.io/api",
    rpcUrl: "https://ethereum-rpc.publicnode.com"
  },
  arbitrum: {
    name: "Arbitrum One",
    chainId: 42161,
    explorerApiUrl: "https://api.arbiscan.io/api",
    rpcUrl: "https://arb1.arbitrum.io/rpc"
  },
  base: {
    name: "Base",
    chainId: 8453,
    explorerApiUrl: "https://api.basescan.org/api",
    rpcUrl: "https://mainnet.base.org"
  },
  optimism: {
    name: "Optimism",
    chainId: 10,
    explorerApiUrl: "https://api-optimistic.etherscan.io/api",
    rpcUrl: "https://mainnet.optimism.io"
  },
  polygon: {
    name: "Polygon",
    chainId: 137,
    explorerApiUrl: "https://api.polygonscan.com/api",
    rpcUrl: "https://polygon-bor-rpc.publicnode.com"
  },
  zksync: {
    name: "zkSync Era",
    chainId: 324,
    explorerApiUrl: "https://block-explorer-api.mainnet.zksync.io/api",
    rpcUrl: "https://mainnet.era.zksync.io"
  },
  sepolia: {
    name: "Sepolia testnet",
    chainId: 11155111,
    explorerApiUrl: "https://api-sepolia.etherscan.io/api",
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com"
  },
  holesky: {
    name: "Holesky testnet",
    chainId: 17e3,
    explorerApiUrl: "https://api-holesky.etherscan.io/api",
    rpcUrl: "https://ethereum-holesky-rpc.publicnode.com"
  }
};
var VIEM_CHAINS = {
  1: import_chains.mainnet,
  42161: import_chains.arbitrum,
  8453: import_chains.base,
  10: import_chains.optimism,
  137: import_chains.polygon,
  324: import_chains.zkSync,
  11155111: import_chains.sepolia,
  17e3: import_chains.holesky
};
function createClient(chainName, config, rpcOverride) {
  const chain = CHAINS[chainName];
  if (!chain) {
    throw new Error(`Unsupported chain: ${chainName}. Supported: ${Object.keys(CHAINS).join(", ")}`);
  }
  const rpcUrl = rpcOverride ?? config.rpcOverrides?.[chainName] ?? chain.rpcUrl;
  const viemChain = VIEM_CHAINS[chain.chainId];
  return (0, import_viem.createPublicClient)({
    chain: viemChain,
    transport: (0, import_viem.http)(rpcUrl)
  });
}
function getChainConfig(chainName) {
  const chain = CHAINS[chainName];
  if (!chain) {
    throw new Error(`Unsupported chain: ${chainName}. Supported: ${Object.keys(CHAINS).join(", ")}`);
  }
  return chain;
}

// src/core/resolver.ts
async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
        continue;
      }
      if (!res.ok) return null;
      const text = await res.text();
      if (!text) return null;
      return JSON.parse(text);
    } catch (err) {
      if (i === retries - 1) return null;
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  return null;
}
async function fetchFromEtherscan(address, chainName, apiKey) {
  if (!apiKey) return null;
  const chain = getChainConfig(chainName);
  const url = `${chain.explorerApiUrl}?chainid=${chain.chainId}&module=contract&action=getsourcecode&address=${address}&apikey=${apiKey}`;
  const data = await fetchWithRetry(url);
  if (!data || data.status !== "1" || !Array.isArray(data.result) || !data.result[0]) return null;
  const r = data.result[0];
  if (r.ABI === "Contract source code not verified") {
    return { isVerified: false, name: "Unknown", abi: null, sourceCode: null };
  }
  let abi = null;
  try {
    abi = JSON.parse(r.ABI);
  } catch {
    abi = null;
  }
  let sourceCode = r.SourceCode || null;
  if (sourceCode?.startsWith("{{")) {
    try {
      const inner = JSON.parse(sourceCode.slice(1, -1));
      const sources = inner.sources;
      sourceCode = Object.values(sources).map((s) => s.content).join("\n\n");
    } catch {
    }
  } else if (sourceCode?.startsWith("{")) {
    try {
      const inner = JSON.parse(sourceCode);
      const sources = inner.sources;
      sourceCode = Object.values(sources).map((s) => s.content).join("\n\n");
    } catch {
    }
  }
  return {
    name: r.ContractName || "Unknown",
    sourceCode,
    abi,
    compilerVersion: r.CompilerVersion?.replace("v", "") || null,
    optimizationEnabled: r.OptimizationUsed === "1",
    runs: r.Runs ? parseInt(r.Runs) : null,
    license: r.LicenseType && r.LicenseType !== "None" ? r.LicenseType : null,
    isVerified: true
  };
}
async function fetchFromSourcify(address, chainId) {
  const url = `https://sourcify.dev/server/v2/contract/${chainId}/${address}?fields=all`;
  const data = await fetchWithRetry(url);
  if (!data) return null;
  const sources = data.sources || {};
  const sourceCode = Object.values(sources).map((s) => s.content).filter(Boolean).join("\n\n") || null;
  const compilation = data.compilation || {};
  const optimizer = compilation.compilerSettings?.optimizer;
  return {
    name: compilation.name || "Unknown",
    sourceCode,
    abi: data.abi || null,
    compilerVersion: compilation.compilerVersion || null,
    optimizationEnabled: optimizer?.enabled ?? null,
    runs: optimizer?.runs ?? null,
    license: data.metadata?.license || null,
    isVerified: true
  };
}
async function resolveContract(address, chainName, config) {
  const chain = getChainConfig(chainName);
  const base2 = {
    address,
    chainId: chain.chainId,
    name: "Unknown",
    sourceCode: null,
    abi: null,
    compilerVersion: null,
    optimizationEnabled: null,
    runs: null,
    license: null,
    isVerified: false,
    isProxy: false,
    implementationAddress: null,
    implementationName: null
  };
  const fromEtherscan = await fetchFromEtherscan(address, chainName, config.etherscanApiKey);
  if (fromEtherscan?.isVerified) {
    return { ...base2, ...fromEtherscan };
  }
  const fromSourcify = await fetchFromSourcify(address, chain.chainId);
  if (fromSourcify?.isVerified) {
    return { ...base2, ...fromSourcify };
  }
  return { ...base2, ...fromEtherscan || {} };
}

// src/core/proxy-detector.ts
init_cjs_shims();
var import_viem2 = require("viem");
var SLOTS = {
  EIP1967_IMPL: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
  EIP1967_ADMIN: "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103",
  EIP1822_UUID: "0xc5f16f0fcc639fa48a6947836d9850f504798523bf8c9a3a87d5876cf622bcf7"
};
function slotToAddress(slot) {
  const hex = slot.slice(2);
  const addrHex = "0x" + hex.slice(-40);
  if (addrHex === "0x0000000000000000000000000000000000000000") return null;
  try {
    return (0, import_viem2.getAddress)(addrHex);
  } catch {
    return null;
  }
}
function hasFunction(abi, name) {
  if (!abi) return false;
  return abi.some((item) => item.type === "function" && item.name === name);
}
function isMinimalProxy(bytecode) {
  const prefix = "363d3d373d3d3d363d73";
  const idx = bytecode.indexOf(prefix);
  if (idx === -1) return null;
  const addrStart = idx + prefix.length;
  const addrHex = "0x" + bytecode.slice(addrStart, addrStart + 40);
  try {
    return (0, import_viem2.getAddress)(addrHex);
  } catch {
    return null;
  }
}
async function detectProxy(address, abi, client, depth = 0) {
  if (depth >= 3) return null;
  const addr = address;
  try {
    const implSlot = await client.getStorageAt({ address: addr, slot: SLOTS.EIP1967_IMPL });
    if (implSlot) {
      const implAddr = slotToAddress(implSlot);
      if (implAddr) {
        const adminSlot = await client.getStorageAt({ address: addr, slot: SLOTS.EIP1967_ADMIN });
        const adminAddr = adminSlot ? slotToAddress(adminSlot) : void 0;
        const isUUPS = hasFunction(abi, "proxiableUUID") || await checkProxiableUUID(addr, client);
        const pattern = isUUPS ? "UUPS (EIP-1822)" : "Transparent (EIP-1967)";
        return {
          pattern,
          implementationAddress: implAddr,
          adminAddress: adminAddr ?? void 0,
          proxySlot: SLOTS.EIP1967_IMPL,
          depth
        };
      }
    }
  } catch {
  }
  try {
    const uuidSlot = await client.getStorageAt({ address: addr, slot: SLOTS.EIP1822_UUID });
    if (uuidSlot) {
      const implAddr = slotToAddress(uuidSlot);
      if (implAddr) {
        return {
          pattern: "UUPS (EIP-1822)",
          implementationAddress: implAddr,
          proxySlot: SLOTS.EIP1822_UUID,
          depth
        };
      }
    }
  } catch {
  }
  if (hasFunction(abi, "beacon")) {
    try {
      const beaconAddr = await client.readContract({
        address: addr,
        abi: [{ type: "function", name: "beacon", inputs: [], outputs: [{ name: "", type: "address" }], stateMutability: "view" }],
        functionName: "beacon"
      });
      if ((0, import_viem2.isAddress)(beaconAddr)) {
        const implAddr = await client.readContract({
          address: beaconAddr,
          abi: [{ type: "function", name: "implementation", inputs: [], outputs: [{ name: "", type: "address" }], stateMutability: "view" }],
          functionName: "implementation"
        });
        if ((0, import_viem2.isAddress)(implAddr)) {
          return { pattern: "Beacon Proxy", implementationAddress: implAddr, depth };
        }
      }
    } catch {
    }
  }
  try {
    const bytecode = await client.getBytecode({ address: addr });
    if (bytecode) {
      const implAddr = isMinimalProxy(bytecode.slice(2));
      if (implAddr) {
        return { pattern: "Minimal Proxy (EIP-1167)", implementationAddress: implAddr, depth };
      }
    }
  } catch {
  }
  if (hasFunction(abi, "facets")) {
    return {
      pattern: "Diamond (EIP-2535)",
      implementationAddress: address,
      depth
    };
  }
  if (hasFunction(abi, "admin") && hasFunction(abi, "implementation")) {
    try {
      const implAddr = await client.readContract({
        address: addr,
        abi: [{ type: "function", name: "implementation", inputs: [], outputs: [{ name: "", type: "address" }], stateMutability: "view" }],
        functionName: "implementation"
      });
      if ((0, import_viem2.isAddress)(implAddr)) {
        return { pattern: "Transparent (OpenZeppelin legacy)", implementationAddress: implAddr, depth };
      }
    } catch {
    }
  }
  return null;
}
async function checkProxiableUUID(address, client) {
  try {
    await client.readContract({
      address,
      abi: [{ type: "function", name: "proxiableUUID", inputs: [], outputs: [{ name: "", type: "bytes32" }], stateMutability: "view" }],
      functionName: "proxiableUUID"
    });
    return true;
  } catch {
    return false;
  }
}
async function resolveProxyChain(address, abi, client) {
  const proxy = await detectProxy(address, abi, client, 0);
  if (!proxy) return null;
  const nested = await detectProxy(proxy.implementationAddress, null, client, proxy.depth + 1);
  if (nested) {
    proxy.chain = nested;
  }
  return proxy;
}

// src/core/standards.ts
init_cjs_shims();
function hasFn(abi, name, inputCount) {
  return abi.some((item) => {
    if (item.type !== "function" || item.name !== name) return false;
    if (inputCount !== void 0 && item.inputs?.length !== inputCount) return false;
    return true;
  });
}
function detectStandards(abi, sourceCode) {
  const has = (name, inputCount) => hasFn(abi, name, inputCount);
  return {
    erc20: has("transfer") && has("approve") && has("allowance") && has("balanceOf") && has("totalSupply"),
    erc721: has("ownerOf") && has("safeTransferFrom", 4),
    erc1155: has("balanceOfBatch") && has("safeTransferFrom", 5),
    erc4626: has("deposit") && has("withdraw") && has("convertToAssets") && has("convertToShares"),
    erc2612: abi.some(
      (item) => item.type === "function" && item.name === "permit" && item.inputs?.length === 7
    ),
    erc4337: has("validateUserOp"),
    ownable: has("owner") && has("transferOwnership"),
    ownable2Step: has("pendingOwner") && has("acceptOwnership"),
    pausable: has("paused") && has("pause") && has("unpause"),
    accessControl: has("hasRole") && has("grantRole") && has("revokeRole"),
    reentrancyGuard: sourceCode ? sourceCode.includes("nonReentrant") : false
  };
}
function standardsToLabels(s) {
  const labels = [];
  if (s.erc20) labels.push("ERC-20");
  if (s.erc721) labels.push("ERC-721");
  if (s.erc1155) labels.push("ERC-1155");
  if (s.erc4626) labels.push("ERC-4626");
  if (s.erc2612) labels.push("ERC-2612");
  if (s.erc4337) labels.push("ERC-4337");
  if (s.ownable2Step) labels.push("Ownable2Step");
  else if (s.ownable) labels.push("Ownable");
  if (s.pausable) labels.push("Pausable");
  if (s.accessControl) labels.push("AccessControl");
  if (s.reentrancyGuard) labels.push("ReentrancyGuard");
  return labels;
}

// src/output/fingerprint.ts
init_cjs_shims();
var import_boxen = __toESM(require("boxen"));
var import_cli_table3 = __toESM(require("cli-table3"));
function shortAddr(addr) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
function securityFlags(contract, proxy, standards) {
  const flags = [];
  if (proxy) flags.push(c.warn("\u26A0 upgradeable"));
  const src = contract.sourceCode || "";
  if (!src.includes("selfdestruct")) flags.push(c.success("\u2713 no selfdestruct"));
  else flags.push(c.danger("\u2717 selfdestruct"));
  if (!src.includes("tx.origin")) flags.push(c.success("\u2713 no tx.origin"));
  else flags.push(c.warn("\u26A0 tx.origin"));
  return flags.join("  ");
}
function printFingerprint(contract, proxy, standards, chainName, balance) {
  const labels = standardsToLabels(standards);
  const labelStr = labels.map((l) => c.address(`[${l}]`)).join(" ");
  const upgLabel = proxy ? c.warn("[Upgradeable]") : "";
  const verLabel = contract.isVerified ? c.success("[Verified]") : c.danger("[Unverified]");
  const badgesLine = [labelStr, upgLabel, verLabel].filter(Boolean).join(" ");
  const headerLines = [
    `${c.bold(contract.name)}  ${badgesLine}`,
    c.address(contract.address)
  ];
  console.log(
    (0, import_boxen.default)(headerLines.join("\n"), {
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      borderStyle: "single",
      borderColor: "cyan"
    })
  );
  console.log();
  const table = new import_cli_table3.default({
    chars: {
      top: "",
      "top-mid": "",
      "top-left": "",
      "top-right": "",
      bottom: "",
      "bottom-mid": "",
      "bottom-left": "",
      "bottom-right": "",
      left: "",
      "left-mid": "",
      mid: "",
      "mid-mid": "",
      right: "",
      "right-mid": "",
      middle: "  "
    },
    style: { "padding-left": 2, "padding-right": 0, border: [], head: [] }
  });
  table.push([c.muted("network"), `${chainName}  (chain ${contract.chainId})`]);
  if (contract.compilerVersion) {
    table.push([c.muted("compiler"), `Solidity ${contract.compilerVersion.split("+")[0]}`]);
  }
  if (contract.license) {
    table.push([c.muted("license"), contract.license]);
  }
  if (!contract.isVerified) {
    table.push([c.muted("source"), c.warn("unverified \u2014 no source code available")]);
  }
  if (balance !== void 0) {
    const eth = Number(balance) / 1e18;
    table.push([c.muted("balance"), `${eth.toFixed(4)} ETH`]);
  }
  console.log(table.toString());
  console.log();
  if (proxy) {
    console.log(`  ${c.muted("proxy")}     ${proxy.pattern}`);
    console.log(`  ${c.muted("impl")}      ${c.address(shortAddr(proxy.implementationAddress))}`);
    if (proxy.adminAddress) {
      console.log(`  ${c.muted("admin")}     ${c.address(shortAddr(proxy.adminAddress))}`);
    }
    console.log(`  ${c.warn("\u26A0 upgradeable")}`);
    console.log();
  }
  if (labels.length > 0) {
    console.log(`  ${c.muted("standards")}  ${labels.map((l) => c.success(l)).join("  ")}`);
    console.log();
  }
  const secLine = securityFlags(contract, proxy, standards);
  if (secLine) {
    console.log(`  ${secLine}`);
    console.log();
  }
}

// src/output/menu.ts
init_cjs_shims();
async function showMenu() {
  if (!process.stdout.isTTY) return null;
  try {
    const { default: inquirer } = await import("inquirer");
    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: c.muted("What do you want to do?"),
        choices: [
          { name: "inspect proxy", value: "proxy" },
          { name: "show inheritance tree", value: "tree" },
          { name: "security surface", value: "security" },
          { name: "watch events", value: "watch" },
          { name: "inspect storage", value: "storage" },
          { name: "export to foundry", value: "export" },
          { name: "open on etherscan", value: "etherscan" },
          { name: "exit", value: "exit" }
        ]
      }
    ]);
    return action;
  } catch {
    return null;
  }
}

// src/commands/inspect.ts
function validateAddress(raw) {
  if (!(0, import_viem3.isAddress)(raw)) {
    throw new Error(`Invalid EVM address: ${raw}`);
  }
  return (0, import_viem3.getAddress)(raw);
}
async function checkIsContract(client, address) {
  const code = await client.getBytecode({ address });
  return !!code && code !== "0x";
}
async function runInspect(rawAddress, chainName, config, rpcOverride, jsonOutput = false) {
  let address;
  try {
    address = validateAddress(rawAddress);
  } catch (err) {
    console.error(`
  ${c.danger("Error:")} ${err.message}
`);
    process.exit(1);
    return;
  }
  const chainConfig = CHAINS[chainName];
  if (!chainConfig) {
    console.error(c.danger(`Unknown chain: ${chainName}`));
    process.exit(1);
    return;
  }
  const spinner = jsonOutput ? null : (0, import_ora.default)({
    text: `  Resolving ${c.address(address.slice(0, 6) + "..." + address.slice(-4))} on ${chainConfig.name}...`,
    spinner: "dots"
  }).start();
  try {
    const client = createClient(chainName, config, rpcOverride);
    const [isContract, contract] = await Promise.all([
      checkIsContract(client, address),
      resolveContract(address, chainName, config)
    ]);
    if (!isContract) {
      spinner?.stop();
      console.log();
      console.log(`  ${c.warn("\u26A0 This address has no bytecode \u2014 it may be an EOA (wallet), not a contract.")}`);
      console.log();
      return;
    }
    const proxy = await resolveProxyChain(address, contract.abi, client);
    if (proxy) {
      contract.isProxy = true;
      contract.implementationAddress = proxy.implementationAddress;
      if (!contract.implementationName) {
        try {
          const impl = await resolveContract(proxy.implementationAddress, chainName, config);
          contract.implementationName = impl.name;
        } catch {
        }
      }
    }
    const standards = detectStandards(contract.abi || [], contract.sourceCode);
    let balance;
    try {
      balance = await client.getBalance({ address });
    } catch {
    }
    spinner?.stop();
    console.log();
    if (jsonOutput) {
      console.log(JSON.stringify({ contract, proxy, standards }, null, 2));
      return;
    }
    printFingerprint(contract, proxy, standards, chainConfig.name, balance);
    const action = await showMenu();
    if (!action || action === "exit") return;
    if (action === "etherscan") {
      const baseUrl = chainConfig.explorerApiUrl.replace("/api", "");
      console.log(`
  ${c.address(baseUrl + "/address/" + address)}
`);
      return;
    }
    console.log(c.muted(`
  Run: unfold ${address} --${action}
`));
  } catch (err) {
    spinner?.fail();
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`
  ${c.danger("Error:")} ${msg}
`);
    process.exit(1);
  }
}

// src/index.ts
init_config();
var program = new import_commander.Command();
program.name("unfold").description("Unfold any EVM contract in seconds").version("0.1.0").argument("<address>", "EVM contract address").option("--chain <name>", "Target chain", "mainnet").option("--rpc <url>", "Custom RPC URL").option("--json", "Output as JSON (no banner or interactive menu)").option("--proxy", "Full proxy analysis").option("--tree", "Inheritance tree + standards").option("--security", "Security surface scan").option("--watch <event>", "Watch contract events live").option("--storage <slot>", "Read a storage slot or variable name").option("--export <format>", "Export: foundry | abi | json").action(async (address, options) => {
  const isJson = options.json === true;
  if (!isJson) {
    printBanner();
  }
  const config = loadConfig();
  const chain = options.chain ?? config.defaultChain ?? "mainnet";
  if (!CHAINS[chain]) {
    console.error(c.danger(`
  Unknown chain: "${chain}"`));
    console.error(c.muted(`  Supported: ${Object.keys(CHAINS).join(", ")}
`));
    process.exit(1);
  }
  if (options.proxy || options.tree || options.security || options.watch || options.storage || options.export) {
    console.log(c.muted(`
  Advanced flags (--proxy, --tree, --security, etc.) are coming in Phase 2 & 3.
`));
    console.log(c.muted(`  Running full fingerprint instead...
`));
  }
  await runInspect(address, chain, config, options.rpc, isJson);
});
program.command("config").description("Manage unfold configuration").command("init").description("Initialize config file").action(async () => {
  const { default: inquirer } = await import("inquirer");
  const { saveConfig: saveConfig2 } = await Promise.resolve().then(() => (init_config(), config_exports));
  printBanner();
  console.log(c.muted("  Initializing ~/.unfold/config.json\n"));
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "etherscanApiKey",
      message: "Etherscan API key (leave blank to skip):"
    },
    {
      type: "list",
      name: "defaultChain",
      message: "Default chain:",
      choices: Object.keys(CHAINS),
      default: "mainnet"
    }
  ]);
  const cfg = {
    defaultChain: answers.defaultChain,
    ...answers.etherscanApiKey ? { etherscanApiKey: answers.etherscanApiKey } : {}
  };
  saveConfig2(cfg);
  console.log(c.success("\n  \u2713 Config saved to ~/.unfold/config.json\n"));
});
program.parse();
