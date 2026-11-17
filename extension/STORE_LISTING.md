# Chrome Web Store listing (0.2.0)

## Short description (max 132 chars)

Check an EVM contract before you interact: who controls it, what it can do, and real red flags. Read-only, no wallet access.

## Description

Paste a contract address (or let Unffold find the ones on the page) and see what it is before you approve, buy or deposit.

• Who controls it: upgrades and admin powers followed to a single key, a Safe multisig (n/m), a timelock or a DAO, with the total delay before changes take effect.
• Plain-language warnings: each one says what it means, what to do, and when it is a false positive, backed by on-chain evidence.
• Known tokens and contracts: official USDC/USDT/PYUSD/EURC (issuer powers explained), canonical and bridged tokens, popular infrastructure like Permit2, Uniswap, 1inch, Seaport and CoW. Tokens that copy a known symbol are flagged.
• Security triage mode: upgradeability, missing access control, unprotected initializers, risky transferFrom, unchecked calls, oracle checks and more, with file and line.
• Honest verdicts: Unffold never says "safe". When it cannot verify something, it says so.
• Works on Ethereum, Base, Arbitrum, Optimism, Polygon, BNB Chain, zkSync, Ronin, Abstract and testnets.
• English, Spanish and Portuguese.

Read-only: Unffold never signs or sends transactions and never touches your wallet. No backend, no tracking. The address is sent only to the chain RPC, Sourcify and (if you add a key) Etherscan.

Triage signals to verify, not a security audit.

## What's new in 0.2.0

- "Who controls" card: EOA, Safe n/m, timelock or DAO, with total delay
- Security mode with detailed, evidence-backed warnings
- Recognizes official, bridged and issuer tokens, and popular contracts; flags symbol copies
- Grey "Couldn't verify" state; warnings now in Spanish and Portuguese
- Copy summary as a Markdown checklist; "Wrong verdict?" report link

## Screenshots

`store-assets/`: token-en.png, security-en.png, security-es.png (1280×800).

## Privacy practices (dashboard answers)

- Single purpose: inspect EVM smart contracts before interacting with them.
- `activeTab` + `scripting`: read visible addresses on the current page when the popup is opened.
- `storage`: save the optional API key, default network and language locally.
- Host permissions: read-only requests to the listed RPCs, Etherscan, Sourcify, IPFS and Arweave.
- Data collected: none. Not sold or transferred.
