# unfold — EVM Contract Explorer CLI
> Complete spec for Claude Code

---

## What is unfold?

`unfold` is a TypeScript CLI that takes any EVM contract address and unfolds everything about it in seconds: identity, proxy chain, inheritance tree, standards, storage, events, and security surface. It replaces 20-40 minutes of manual Etherscan + cast + hardhat work with a single command.

```bash
npx unfold 0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0
npx unfold 0x7f39... --chain arbitrum
npx unfold 0x7f39... --proxy
npx unfold 0x7f39... --tree
npx unfold 0x7f39... --security
npx unfold 0x7f39... --watch Transfer
npx unfold 0x7f39... --storage owner
npx unfold 0x7f39... --export foundry
```

---

## Tech stack

- **Runtime:** Node.js 18+ / TypeScript
- **CLI framework:** `commander` + `inquirer` (interactive menu)
- **Terminal UI:** `chalk` (colors) + `ora` (spinners) + `boxen` (boxes) + `cli-table3` (tables)
- **EVM interaction:** `viem` (primary) + `ethers v6` (fallback for ABI parsing edge cases)
- **Source fetching:** Etherscan API v2 + Sourcify API (fallback)
- **AST parsing:** `@solidity-parser/parser`
- **Build:** `tsup` (bundles to single CJS file)
- **Package:** published to npm as `unfold`

---

## Project structure

```
unfold/
├── src/
│   ├── index.ts              ← CLI entry, commander setup, ASCII banner
│   ├── commands/
│   │   ├── inspect.ts        ← default command: full fingerprint
│   │   ├── proxy.ts          ← --proxy flag
│   │   ├── tree.ts           ← --tree flag (inheritance)
│   │   ├── security.ts       ← --security flag
│   │   ├── watch.ts          ← --watch <event> flag
│   │   ├── storage.ts        ← --storage <slot|name> flag
│   │   └── export.ts         ← --export foundry|abi|json
│   ├── core/
│   │   ├── resolver.ts       ← fetch source + ABI from Etherscan/Sourcify
│   │   ├── proxy-detector.ts ← detect proxy pattern + resolve impl
│   │   ├── ast-analyzer.ts   ← parse Solidity AST → inheritance, standards
│   │   ├── standards.ts      ← detect ERC-20/721/1155/4626/4337/2612 etc
│   │   ├── rpc.ts            ← viem client factory, multichain support
│   │   └── storage-layout.ts ← compute slot for named variables + mappings
│   ├── output/
│   │   ├── banner.ts         ← ASCII art on startup
│   │   ├── fingerprint.ts    ← renders the main identity output
│   │   ├── colors.ts         ← chalk color constants (green/yellow/red/cyan)
│   │   └── menu.ts           ← interactive inquirer menu
│   └── types.ts              ← shared TypeScript interfaces
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── README.md
```

---

## ASCII banner (src/output/banner.ts)

```
 _   _        __      _     _ 
| | | |_ __  / _|___ | | __| |
| | | | '_ \| |_/ _ \| |/ _` |
| |_| | | | |  _| (_) | | (_| |
 \___/|_| |_|_|  \___/|_|\__,_|

  contract explorer v0.1.0
  by alva-p · github.com/alv-arez/unfold
```

Show banner on every run EXCEPT when --json flag is passed.

---

## Supported chains (src/core/rpc.ts)

Map of chain name → chainId + RPC + Etherscan API URL:

| flag name     | chainId | explorer base URL                    |
|---------------|---------|--------------------------------------|
| mainnet       | 1       | https://api.etherscan.io/api         |
| arbitrum      | 42161   | https://api.arbiscan.io/api          |
| base          | 8453    | https://api.basescan.org/api         |
| optimism      | 10      | https://api-optimistic.etherscan.io/api |
| polygon       | 137     | https://api.polygonscan.com/api      |
| zksync        | 324     | https://block-explorer-api.mainnet.zksync.io/api |
| sepolia       | 11155111| https://api-sepolia.etherscan.io/api |
| holesky       | 17000   | https://api-holesky.etherscan.io/api |

Default: mainnet. Override with `--chain <name>`.

RPC: use public RPCs from viem's built-in chain configs. Accept `--rpc <url>` override.
Etherscan API key: read from `ETHERSCAN_API_KEY` env var or `~/.unfold/config.json`.

---

## Core modules

### resolver.ts

```typescript
interface ResolvedContract {
  address: string
  chainId: number
  name: string
  sourceCode: string | null      // full Solidity source if verified
  abi: AbiItem[] | null
  compilerVersion: string | null
  optimizationEnabled: boolean | null
  runs: number | null
  license: string | null
  isVerified: boolean
  isProxy: boolean               // filled by proxy-detector
  implementationAddress: string | null
}
```

Steps:
1. Try Etherscan API: `?module=contract&action=getsourcecode&address=<addr>`
2. If unverified or rate-limited, try Sourcify: `https://sourcify.dev/server/v1/files/any/<chainId>/<addr>`
3. Return `ResolvedContract` — null fields if unverified

### proxy-detector.ts

Detect proxy pattern from bytecode + source. In order:

1. **EIP-1967 Transparent** — read storage slot `0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc`
2. **UUPS (EIP-1822)** — check for `proxiableUUID()` in ABI + read slot `0x360894...`
3. **Beacon Proxy** — check for `beacon()` function, then read beacon's `implementation()`
4. **Minimal Proxy (EIP-1167)** — match bytecode prefix `0x363d3d373d3d3d363d73`
5. **Diamond (EIP-2535)** — check for `facets()` function in ABI
6. **OpenZeppelin Transparent (legacy)** — check for `admin()` + `implementation()` functions

For each match: return `{ pattern, implementationAddress, adminAddress?, proxySlot }`.
If no proxy detected: return `null`.

Recurse on implementationAddress up to depth 3 (proxy of proxy of proxy).

### ast-analyzer.ts

Parse `sourceCode` with `@solidity-parser/parser`.
Extract:
- `inheritanceTree`: array of `{ name, parents: string[] }` for each contract
- `functions`: array of `{ name, visibility, stateMutability, modifiers }`
- `events`: array of `{ name, inputs }`
- `errors`: array of `{ name }`
- `stateVariables`: array of `{ name, type, visibility, slot? }`
- `imports`: array of import paths (detect OpenZeppelin version if present)

### standards.ts

Given ABI, detect which ERC standards are implemented:

| Standard | Detection method |
|----------|-----------------|
| ERC-20   | has transfer, approve, allowance, balanceOf, totalSupply |
| ERC-721  | has ownerOf, safeTransferFrom (with 4 args) |
| ERC-1155 | has balanceOfBatch, safeTransferFrom (with 5 args) |
| ERC-4626 | has deposit, withdraw, convertToAssets, convertToShares |
| ERC-2612 | has permit(address,address,uint256,uint256,uint8,bytes32,bytes32) |
| ERC-4337 | has validateUserOp |
| Ownable  | has owner(), transferOwnership() |
| Ownable2Step | has pendingOwner(), acceptOwnership() |
| Pausable | has paused(), pause(), unpause() |
| AccessControl | has hasRole(), grantRole(), revokeRole() |
| ReentrancyGuard | detect in source: `nonReentrant` modifier usage |

---

## Commands in detail

### Default: `unfold <address>`

Runs full fingerprint. Output sections in order:

**1. Loading line** (while fetching):
```
  Resolving 0x7f39...2Ca0 on mainnet...
```

**2. Header block** (boxen, single border):
```
  wstETH                    [ERC-20] [ERC-2612] [Upgradeable] [Verified]
  Wrapped liquid staking token · Lido Protocol
  0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0
```

**3. Identity table**:
```
  network      Ethereum mainnet  (chain 1)
  compiler     Solidity 0.8.9
  license      GPL-3.0
  deployed     block 13,475,304  (Nov 2021)
  balance      0 ETH  ·  total supply 3,421,804 wstETH
```

**4. Proxy summary** (if proxy detected):
```
  proxy        EIP-1967 Transparent Upgradeable
  impl         0x3e66...a2f1  (WstETH v2)
  admin        0xab23...4f22  (EOA or multisig label if known)
  ⚠ upgradeable — last upgrade 42 days ago
```

**5. Standards line**:
```
  standards    ERC-20  ERC-2612  Ownable
```

**6. Quick security line**:
```
  ⚠ upgradeable  ✓ no selfdestruct  ✓ no tx.origin
```

**7. Interactive menu** (if TTY, skip if piped):
```
  What do you want to do?
  ❯ read state
    inspect proxy
    show inheritance tree
    security surface
    watch events
    inspect storage
    export to foundry
    open on etherscan
    exit
```

---

### `--proxy` flag

Full proxy analysis output:

```
  PROXY ANALYSIS
  ──────────────────────────────────────────────────
  pattern      Transparent Upgradeable (OpenZeppelin)
  proxy        0x7f39...2Ca0  (this contract)
  impl slot    0x360894...  →  0x3e66...a2f1
  admin slot   0xb531...    →  0xab23...4f22  (Lido Multisig)

  UPGRADE HISTORY
  current      0x3e66...a2f1  WstETH v2  block 18,420,001  (42d ago)
  previous     0x1a4c...cc03  WstETH v1  block 15,100,200

  PATTERNS CHECKED
  ✓ EIP-1967 Transparent   MATCH
  ○ UUPS (EIP-1822)        no
  ○ Diamond (EIP-2535)     no
  ○ Beacon Proxy           no
  ○ Minimal Proxy EIP-1167 no

  ⚠ admin can upgrade without timelock
```

Get upgrade history by querying `Upgraded(address)` event logs from block 0.

---

### `--tree` flag

Inheritance tree + standards:

```
  INHERITANCE TREE
  ──────────────────────────────────────────────────
  WstETH  (implementation)
  └── ERC20Permit
      └── ERC20
          ├── IERC20
          └── Context
      └── IERC20Permit
  └── Ownable

  STANDARDS DETECTED
  ✓ ERC-20       transfer, approve, allowance, balanceOf, totalSupply
  ✓ ERC-2612     permit() gasless approvals
  ✓ Ownable      owner: 0xab23...4f22
  ○ ERC-721      no
  ○ ERC-4626     no
  ○ Pausable     no

  PARENT CONTRACTS
  direct parent    ERC20Permit  ·  OpenZeppelin 4.7.3
  grandparent      ERC20        ·  OpenZeppelin 4.7.3
  lib version      ✓ matches known OZ bytecode
```

Detect OZ version by matching known bytecode hashes or import paths.

---

### `--security` flag

```
  SECURITY SURFACE
  ──────────────────────────────────────────────────
  ⚠ Upgradeable        admin: 0xab23...4f22 (Multisig 5/9)
  ⚠ No timelock        upgrade functions unprotected by delay
  ✓ No selfdestruct    not present in source
  ✓ No tx.origin       not present in source
  ✓ No delegatecall    not in implementation
  ✓ Reentrancy guards  4/4 external calls protected

  ACCESS CONTROL
  owner            0xab23...4f22
  privileged fns   3  →  setStETH  pause  upgradeTo
  unprotected fns  0

  ACTIVITY
  last tx      2 minutes ago  block 19,842,001
  last upgrade 42 days ago    block 18,420,001
```

Unprotected functions: scan ABI for state-changing functions (non-view, non-pure)
that have NO modifiers in source (onlyOwner, onlyRole, whenNotPaused, etc).

---

### `--watch <event>` flag

```bash
unfold 0x7f39... --watch Transfer
unfold 0x7f39... --watch all
```

Subscribe to contract events via viem `watchContractEvent`.
Stream decoded events to terminal as they arrive:

```
  Watching Transfer on 0x7f39...2Ca0
  ─────────────────────────────────────────────────
  [19842001] Transfer
    from   0xabc...123
    to     0xdef...456
    value  500.00 wstETH
  
  [19842003] Transfer
    from   0x111...222
    to     0x333...444
    value  12.30 wstETH
```

Decode amounts using ABI types. Format uint256 with 18 decimals if ERC-20.
Ctrl+C to stop. Show running count of events received.

---

### `--storage <name|slot>` flag

```bash
unfold 0x7f39... --storage owner
unfold 0x7f39... --storage 0
unfold 0x7f39... --storage "balances[0xd8dA...]"
```

Read a storage slot by:
- **number** → read directly via `eth_getStorageAt`
- **variable name** → look up in parsed state variables, compute slot
- **mapping key** → compute `keccak256(key || slot)` and read

Output:
```
  STORAGE
  ──────────────────────────────────────────────────
  variable     owner
  slot         0x0000...0000
  raw          0x000000000000000000000000ab234f22...
  decoded      0xab23...4f22  (address)
```

---

### `--export foundry` flag

Generate a ready-to-use Foundry test file:

```solidity
// SPDX-License-Identifier: MIT
// Auto-generated by unfold v0.1.0
// unfold 0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0 --export foundry

pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";

interface IWstETH {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function getStETHByWstETH(uint256) external view returns (uint256);
    // ... all ABI functions
}

contract WstETHTest is Test {
    IWstETH public wstETH;

    function setUp() public {
        vm.createSelectFork(vm.envString("MAINNET_RPC_URL"));
        wstETH = IWstETH(0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0);
    }

    function test_example() public view {
        // Start writing your test here
        uint256 supply = wstETH.totalSupply();
        assertGt(supply, 0);
    }
}
```

Save to `./test/<ContractName>.t.sol`. Print path on success.

Also support `--export abi` → save `<ContractName>.abi.json`
And `--export json` → save full resolved contract as JSON.

---

### `--read` flag (bonus, simple)

```bash
unfold 0x7f39... --read "balanceOf(0xd8dA...)"
```

Parse the function call string, match to ABI, call via viem, decode and print result.

---

## Color scheme (src/output/colors.ts)

Using chalk:

```typescript
export const c = {
  success:  chalk.hex('#4ec994'),   // green  — verified, safe, ok
  warn:     chalk.hex('#f5c842'),   // yellow — warnings, upgradeability
  danger:   chalk.hex('#f07070'),   // red    — risks, errors
  address:  chalk.hex('#56d4d4'),   // cyan   — addresses, values
  bold:     chalk.white.bold,       // white bold — important values
  muted:    chalk.hex('#888888'),   // gray   — labels, context
  dim:      chalk.hex('#555555'),   // dark gray — secondary info
}
```

---

## Config file (~/.unfold/config.json)

```json
{
  "etherscanApiKey": "YOUR_KEY",
  "defaultChain": "mainnet",
  "rpcOverrides": {
    "mainnet": "https://eth.llamarpc.com",
    "arbitrum": "https://arb1.arbitrum.io/rpc"
  }
}
```

Initialize with `unfold config init`.

---

## Error handling

- **Unverified contract** → show what IS available (bytecode size, balance, tx count) + warn
- **Rate limited** → retry with exponential backoff, show spinner
- **Invalid address** → validate checksum before any RPC call, clear error message
- **Not a contract** → detect EOA (no bytecode), show wallet info instead
- **Network error** → suggest checking RPC or adding API key

---

## MVP scope (build in this order)

### Phase 1 — Core (weeks 1-2)
- [ ] CLI entry with commander + banner
- [ ] `resolver.ts` — fetch from Etherscan + Sourcify fallback
- [ ] `proxy-detector.ts` — EIP-1967 + UUPS + Minimal Proxy
- [ ] `fingerprint.ts` — default output with identity + proxy + standards
- [ ] Multichain support (mainnet, arbitrum, base, sepolia)
- [ ] `--chain` and `--rpc` flags
- [ ] Config file + `ETHERSCAN_API_KEY` env var

### Phase 2 — Analysis (weeks 3-4)
- [ ] `ast-analyzer.ts` — inheritance tree from source
- [ ] `standards.ts` — ERC standard detection from ABI
- [ ] `--tree` flag output
- [ ] `--security` flag output
- [ ] `--proxy` flag with upgrade history

### Phase 3 — Interaction (weeks 5-6)
- [ ] Interactive inquirer menu (when TTY)
- [ ] `--watch <event>` — live event stream
- [ ] `--storage <name|slot>` — storage reader
- [ ] `--read "fn(args)"` — call any view function
- [ ] `--export foundry` — generate .t.sol

### Phase 4 — Polish (week 7-8)
- [ ] `--export abi` and `--export json`
- [ ] Detect EOA and show wallet info
- [ ] `unfold config init` wizard
- [ ] README with GIF demo
- [ ] Publish to npm

---

## README structure (for GitHub)

```markdown
# unfold

> Unfold any EVM contract in seconds.

[GIF DEMO HERE — show running against wstETH, show proxy resolution + tree]

\`\`\`bash
npm install -g unfold
unfold 0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0
\`\`\`

## What it does
- Resolves proxy chains (EIP-1967, UUPS, Diamond, Beacon, Minimal)
- Shows full inheritance tree from Solidity source
- Detects ERC standards from ABI
- Security surface scan
- Live event watcher
- Storage slot reader
- Export to Foundry test

## Supported chains
mainnet · arbitrum · base · optimism · polygon · zksync · sepolia

## Usage
[table of all flags]

## Configuration
[ETHERSCAN_API_KEY setup]
```

---

## Key implementation notes for Claude Code

1. **Use viem for all RPC calls** — `createPublicClient` with `http()` transport
2. **`eth_getStorageAt`** for proxy slot reading — viem has `getStorageAt`
3. **`@solidity-parser/parser`** — `parse(source, { tolerant: true, loc: true })`
4. **Etherscan API** — always add `&apikey=${key}` — without key, rate limit is 1 req/5s
5. **Sourcify fallback** — `GET https://sourcify.dev/server/v1/files/any/{chainId}/{address}`
6. **Proxy slots** — read with `getStorageAt` then right-pad the result to get the address (last 20 bytes)
7. **For upgrade history** — use `getLogs` with `Upgraded(address indexed implementation)` topic: `0xbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b`
8. **For event watching** — viem `watchContractEvent` with `onLogs` callback
9. **For storage slot of mapping** — `keccak256(abi.encodePacked(key, slot))` — viem has `keccak256` + `encodePacked`
10. **tsup config** — bundle to `dist/index.cjs`, set `bin` in package.json to that file

---

## package.json (key fields)

```json
{
  "name": "unfold",
  "version": "0.1.0",
  "description": "Unfold any EVM contract in seconds",
  "bin": {
    "unfold": "./dist/index.cjs"
  },
  "keywords": ["ethereum", "evm", "solidity", "cli", "smart-contracts", "web3", "audit"],
  "dependencies": {
    "viem": "^2.x",
    "commander": "^12.x",
    "inquirer": "^9.x",
    "chalk": "^5.x",
    "ora": "^8.x",
    "boxen": "^8.x",
    "cli-table3": "^0.6.x",
    "@solidity-parser/parser": "^0.18.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "tsup": "^8.x",
    "@types/node": "^20.x",
    "@types/inquirer": "^9.x"
  }
}
```

---

## First prompt to send to Claude Code

Paste this entire document and add:

"Build the unfold CLI following this spec. Start with Phase 1 only: CLI entry with banner, resolver.ts fetching from Etherscan + Sourcify fallback, proxy-detector for EIP-1967 and UUPS, fingerprint output, multichain support for mainnet/arbitrum/base/sepolia, and --chain flag. Use viem for all RPC. Make it runnable with `npx ts-node src/index.ts <address>`."