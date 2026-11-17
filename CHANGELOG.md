# Changelog

The CLI (`unfold-evm` on npm, tags `vX.Y.Z`) and the Chrome extension (tags `extension-vX.Y.Z`) are versioned separately.

## CLI 0.3.0 — 2026-11-17

### Security triage (`--security`)
- Detectors with severity, confidence, `file:line`, code, on-chain evidence and docs ([`docs/detectors.md`](docs/detectors.md)): upgradeability, access control, unprotected initializers, UUPS authorization and missing `upgradeTo*`, on-chain initializer state (OpenZeppelin v5), unchecked low-level calls, Chainlink oracle checks, `arbitrary-transfer-from`, selfdestruct / delegatecall / tx.origin
- **Who controls**: proxy admin and owner followed to a single key, a Safe (n/m), a timelock or a DAO, with the total delay; `single-key-control` finding
- Output: `--verbose`, `--json`, `--sarif` (stable fingerprints), `--markdown`, `--fail-on <severity>`
- Triage baseline: `--baseline <file>` / `--update-baseline` hide reviewed findings; findings return when the code changes. Works as a cron upgrade monitor

### Tokens and proxies
- Known tokens: issuer (USDC, USDT, PYUSD, EURC), canonical (WETH, DAI, WBTC, wstETH, stETH, USDe, LINK, UNI) and bridged (USDC.e, USDbC…); tokens copying a known symbol are flagged
- Known infrastructure badge: Permit2, Uniswap routers, 1inch, Seaport, CoW, Aave V3
- Separates what a token *can* do from its current state (renounced owner, paused now)
- EIP-897 / Aragon AppProxy (Lido stETH)
- Upgrade history via Etherscan logs (shown as unavailable rather than empty without a key), plus the `unffold diff` command for the last upgrade
- Wording never says "safe": *no red flags found* / *review needed*

### Fixes
- `--version` and the banner now show the real version

## Extension 0.2.0 — 2026-11-17

- "Who controls" card: EOA, Safe n/m, timelock or DAO, with total delay
- Security mode: warnings split into what it means, what to do, false positive if, and on-chain evidence, with docs links
- Recognizes official, issuer and bridged tokens and popular contracts; flags symbol copies
- Grey "Couldn't verify" state and an action line under every verdict
- Warnings, control paths and labels in Spanish and Portuguese
- Copy summary as a Markdown checklist; "Wrong verdict?" link opens a prefilled GitHub issue
- Privacy note in the popup
- Compact layout once a result is shown, translated and color-coded badges (official, issuer, bridged, single-key admin), optional-key hint on first run

## Extension 0.1.2

- NFT preview, page address detection, risk summary, English / Spanish / Portuguese UI

## CLI 0.2.0 — 2026-06-02

- `diff`, `--facets`, `trace`

## CLI 0.1.0 — 2026-05-23

- Initial release
