# unfold

> Unfold any EVM contract in seconds.

`unfold` is a TypeScript CLI for quickly inspecting EVM contracts: identity, proxy chain, inheritance tree, ERC standards, storage, events, and security surface.

```bash
npm install -g unfold
unfold 0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0
```

For local development in this repo:

```bash
npm install
npm run build
node dist/index.cjs 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 --tree
```

## What It Does

- Resolves verified source and ABI from Etherscan API V2, with Sourcify fallback.
- Detects proxy patterns: EIP-1967, UUPS, Beacon, Minimal Proxy, Diamond, and legacy OpenZeppelin transparent proxies.
- Prints inheritance trees from Solidity source.
- Detects common standards from ABI: ERC-20, ERC-721, ERC-1155, ERC-4626, ERC-2612, Ownable, Pausable, AccessControl, and more.
- Scans a basic security surface: upgradeability, `selfdestruct`, `tx.origin`, `delegatecall`, and unguarded state-changing functions.
- Reads direct storage slots, named variables, and simple mappings.
- Watches decoded contract events.
- Exports ABI, JSON, and Foundry starter tests.

## Supported Chains

`mainnet`, `arbitrum`, `base`, `optimism`, `polygon`, `zksync`, `sepolia`, `holesky`

Use `--chain <name>` to select a chain:

```bash
unfold 0x... --chain arbitrum
```

Use `--rpc <url>` to override the RPC for a single command:

```bash
unfold 0x... --chain mainnet --rpc https://eth.llamarpc.com
```

## Usage

```bash
unfold <address> [options]
```

| Option | Description |
| --- | --- |
| `--chain <name>` | Target chain. Defaults to config, then `mainnet`. |
| `--rpc <url>` | Custom RPC URL for this run. |
| `--json` | Machine-readable output. Skips banner and menu. |
| `--proxy` | Full proxy analysis and upgrade log lookup. |
| `--tree` | Inheritance tree and standards summary. |
| `--security` | Basic security surface scan. |
| `--watch <event>` | Watch decoded events. Use `all` for every event. |
| `--storage <query>` | Read slot, variable, or simple mapping key. |
| `--read <call>` | Call a view or pure function by ABI. |
| `--export <format>` | Export `foundry`, `abi`, or `json`. |

Examples:

```bash
unfold 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 --read "symbol()"
unfold 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 --storage 0
unfold 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 --storage "balanceOf[0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045]"
unfold 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 --watch Transfer
unfold 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 --export foundry
```

## Configuration

Etherscan API V2 requires an API key for source lookups. Every user should use their own key; the package does not embed one.

Set it for the current shell:

```bash
export ETHERSCAN_API_KEY=your_key_here
```

Or create `~/.unfold/config.json` interactively:

```bash
unfold config init
```

Config shape:

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

`ETHERSCAN_API_KEY` takes precedence over the config file.

## Notes

- Storage layout inference is best-effort and currently supports simple source-level variables and first-level mappings.
- `--read` only calls `view` or `pure` functions; it will not send transactions.
- Source parsing requires verified, parseable Solidity source.
