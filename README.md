<p align="center">
  <img src="https://img.shields.io/npm/v/unfold-evm?color=4ec994&label=npm&style=flat-square" alt="npm version" />
  <img src="https://img.shields.io/npm/l/unfold-evm?color=7eb8f7&style=flat-square" alt="license" />
  <img src="https://img.shields.io/node/v/unfold-evm?color=f5c842&style=flat-square" alt="node" />
  <img src="https://github.com/alva-p/unffold/actions/workflows/ci.yml/badge.svg" alt="CI" />
</p>

<p align="center">
  <b>unffold</b> — Web3 inspection from the terminal and Chrome
</p>

<p align="center">
  <img src="docs/demo.gif" alt="unffold demo" width="700" />
</p>

---

`unffold` ships as both a CLI and a Chrome extension for fast EVM reconnaissance:

- **CLI** — fast terminal inspection for contracts, proxies, traces, storage, events, and risk summaries.
- **Chrome extension** — paste or auto-detect an address/tx on explorers and dapps, then inspect risk without opening a terminal.

Links: [npm](https://www.npmjs.com/package/unfold-evm) · [privacy policy](extension/PRIVACY.md)

## Install

```bash
npm install -g unfold-evm
```

Requires Node.js 20+.

## Quick start

```bash
# fingerprint a contract
unffold 0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0

# interactive mode — pick address and action from menus
unffold
```

After the fingerprint, `unffold` drops into an interactive menu so you can keep exploring without retyping the address.

## What You Get

### CLI

- **Fingerprint** — name, standards (ERC-20, ERC-721, ERC-4626 …), compiler, license, balance, total supply
- **Proxy analysis** — detects EIP-1967 Transparent, UUPS, Beacon, Diamond, Minimal Proxy; shows implementation address, admin, and upgrade history
- **Diff** — compare ABI and storage layout between two contracts or two proxy implementations
- **Diamond facets** — enumerate all EIP-2535 facets and map selectors to function names
- **Trace** — decode calldata and events from any transaction; auto-resolves proxy implementation ABIs
- **Inheritance tree** — full parent chain parsed from Solidity source
- **Security surface** — upgradeability, `selfdestruct`, `tx.origin`, `delegatecall`, reentrancy guards, unprotected privileged functions
- **Read state** — call any `view` function by name with arguments
- **Watch events** — stream decoded events live to the terminal
- **Inspect storage** — read any slot by index, variable name, or mapping key
- **Export** — Foundry fork test stub, ABI JSON, full contract JSON

### Browser Extension

<p align="center">
  <img src="docs/extension-nft-preview.png" alt="Unffold Chrome extension NFT preview" width="700" />
</p>

- Detects contract addresses and transaction hashes on the active page.
- Auto-selects the network from supported explorers.
- Modes: `Analyze`, `Token`, `NFT`, `Proxy`, `Vault`, `Game`, `Security`, and `Trace`.
- Shows a compact Risk Summary, warnings, checklist, facts, explorer links, copyable summary, and visible retryable errors.
- NFT mode reads `contractURI`, `tokenURI(0/1)`, normalizes `ipfs://`/`ar://`, and renders the preview image when metadata exposes `image` or `image_url`.
- Settings stay local in `chrome.storage.local`.

## Usage

```bash
unffold <address> [options]
unffold <command> [args]
```

### Flags

| Option | Description |
|---|---|
| `--chain <name>` | Target chain (default: `mainnet`) |
| `--rpc <url>` | Override RPC for this run |
| `--no-menu` | Do not open the interactive menu after inspect |
| `--quiet` | Hide banner and inspect progress lines |
| `--simple` | Print a short non-technical summary |
| `--proxy` | Proxy analysis + upgrade history |
| `--tree` | Inheritance tree + detected standards |
| `--security` | Security surface scan |
| `--read "<fn(args)>"` | Call a view function |
| `--watch <event\|all>` | Stream live events |
| `--storage <slot\|name\|mapping>` | Read a storage slot |
| `--export <foundry\|abi\|json>` | Export artifacts |
| `--output <path>` | Destination directory for `--export` |
| `--facets` | Enumerate Diamond (EIP-2535) facets |
| `--json` | Machine-readable output, no banner or menu |

### Commands

| Command | Description |
|---|---|
| `unffold diff <addr1> <addr2>` | Compare ABI and storage between two contracts |
| `unffold trace <txhash>` | Decode calldata and events of a transaction |
| `unffold analyze <address>` | Auto-detect token, NFT, vault, game, proxy, or generic contract profile |
| `unffold token <address>` | ERC-20-focused token metadata and risk summary |
| `unffold proxy <address>` | Proxy upgradeability and admin risk summary |
| `unffold vault <address>` | ERC-4626-focused vault metadata and risk summary |
| `unffold nft <address>` | NFT collection metadata and risk summary |
| `unffold game <address>` | Game / on-chain app controls and risk summary |
| `unffold config init` | Setup wizard for `~/.unfold/config.json` |
| `unffold config show` | Print current config |
| `unffold config set <key> <value>` | Edit a config value without the wizard |
| `unffold config path` | Print the config file path |

`analyze`, `token`, `proxy`, `vault`, `nft`, and `game` support `--json` and include
a common `report` object designed for UI clients such as the browser extension.

### Examples

```bash
# proxy deep-dive on wstETH
unffold 0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0 --proxy

# diff two USDC implementations to audit an upgrade
unffold diff 0xa2327a938Febf5FEC13baCFb16Ae10EcBc4cbDCF \
             0x43506849d7c04f9138d1a2050bbf3a0c054402dd

# decode a transaction — works through proxies
unffold trace 0x149589da5cb6a163a7a06aa534c08e84ee2acf411a82b5d230d4b9627acfba86

# enumerate diamond facets on Polygon
unffold 0x86935F11C86623deC8a25696E1C19a8659CbF95d --chain polygon --facets

# call totalSupply on USDC (Base)
unffold 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 --chain base --read "totalSupply()"

# read a mapping slot
unffold 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 \
  --storage "balanceOf[0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045]"

# stream Transfer events live
unffold 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 --watch Transfer

# token-focused summary for non-technical review
unffold token 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 --chain mainnet

# auto-detect the best profile
unffold analyze 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 --chain mainnet

# proxy upgradeability summary
unffold proxy 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 --chain mainnet

# ERC-4626 vault summary
unffold vault 0x83F20F44975D03b1b09e64809B757c47f942BEeA --chain mainnet

# NFT collection summary
unffold nft 0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d --chain mainnet

# export a Foundry fork test to a specific directory
unffold 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 --export foundry --output ./test
```

## Supported chains

`mainnet` · `arbitrum` · `base` · `bsc` · `ronin` · `abstract` · `optimism` · `polygon` · `zksync` · `sepolia` · `holesky`

## Configuration

Source lookups use Etherscan API V2. Without an API key, `unffold` falls back to Sourcify automatically — no key required for most verified contracts.

To use your own Etherscan key:

```bash
# one-off
export ETHERSCAN_API_KEY=your_key_here

# or persist it
unffold config init
```

`unffold config init` includes an onboarding prompt with a direct link to the
Etherscan API dashboard: https://etherscan.io/apidashboard

You can also manage config directly without the wizard:

```bash
unffold config set etherscanApiKey YOUR_KEY
unffold config set defaultChain base
unffold config set rpcOverrides.mainnet https://eth.llamarpc.com
unffold config show
```

`~/.unfold/config.json` shape:

```json
{
  "etherscanApiKey": "YOUR_KEY",
  "defaultChain": "mainnet",
  "rpcOverrides": {
    "mainnet": "https://eth.llamarpc.com"
  }
}
```

`ETHERSCAN_API_KEY` env var takes precedence over the config file.

## Chrome Extension

The extension is meant for quick checks while browsing explorers, dapps, token pages, and NFT collections. It runs the same report layer as the CLI, but presents it as compact cards with mode buttons, facts, warnings, checklist items, explorer links, and copyable summaries.

Build the extension bundle:

```bash
npm run build:extension
```

Then open `chrome://extensions`, enable developer mode, choose **Load unpacked**,
and select the `extension/` directory.

The extension supports the same chains as the CLI:

`mainnet` · `arbitrum` · `base` · `bsc` · `ronin` · `abstract` · `optimism` · `polygon` · `zksync` · `sepolia` · `holesky`

It uses:

- `chrome.storage.local` for the Etherscan API key, default network, and UI language.
- The active tab only to scan visible text/links for addresses and tx hashes.
- Public RPCs, Etherscan V2-compatible APIs, Sourcify, IPFS, and Arweave for contract and NFT metadata.

No backend is required.

### Extension Files

- `extension/manifest.json` — Chrome MV3 manifest and host permissions.
- `extension/popup.html` — popup shell.
- `extension/styles.css` — popup UI.
- `extension/src/popup.ts` — extension logic bundled into `extension/dist/popup.js`.
- `extension/icons/` — Chrome Web Store icon sizes: 16, 32, 48, 128.

### Privacy

The extension does not send data to a Unffold server. Your API key stays in local Chrome storage. Analysis requests go directly from your browser to the configured RPC/explorer services, Sourcify, and metadata gateways needed for the selected chain.

See [extension/PRIVACY.md](extension/PRIVACY.md).

## Contributing

PRs and issues are welcome.

```bash
git clone https://github.com/alva-p/unffold
cd unffold
npm install
npm run build
npm test
```

## License

MIT — see [LICENSE](LICENSE)
