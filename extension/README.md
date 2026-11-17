# Unffold Chrome Extension

MVP extension for manual EVM address checks.

## Local test

```sh
npm run build:extension
```

Then open `chrome://extensions`, enable developer mode, choose **Load unpacked**, and select this `extension/` directory.

The popup stores the Etherscan API key in `chrome.storage.local`. Once saved,
the API key setup panel is hidden and can be reopened from **Settings**.

What it shows:

- a verdict that never says "safe": *Review needed*, *High risk*, *No red flags found*, or a grey *Couldn't verify* when there is not enough data
- **who controls** the contract: upgrades and owner, followed to a single key, a Safe (n/m), a timelock or a DAO, with the total delay
- security triage (Security mode): each warning splits into what it means, what to do, when it is a false positive, and on-chain evidence, with a link to [`docs/detectors.md`](../docs/detectors.md)
- known tokens and contracts: official issuer tokens (USDC, USDT…), canonical and bridged tokens, popular infrastructure (Permit2, Uniswap, 1inch, Seaport, CoW); tokens copying a known symbol are flagged
- English, Spanish, and Portuguese, including warnings
- active-page address detection, Markdown copy summary, and a "wrong verdict?" link that opens a prefilled GitHub issue

Store listing text: [`STORE_LISTING.md`](STORE_LISTING.md). Privacy: [`PRIVACY.md`](PRIVACY.md).
