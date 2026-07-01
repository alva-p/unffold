# Unffold Extension Privacy

Unffold does not use a backend server.

The extension stores these settings in `chrome.storage.local`:

- Etherscan API key
- default network
- UI language

When you run an analysis, the extension sends requests directly from your browser to the selected chain RPC, Etherscan-compatible APIs, Sourcify, IPFS, or Arweave as needed. The active tab is only scanned locally for visible contract addresses and transaction hashes.

Unffold does not sell, share, or upload your API key or browsing data to a Unffold-controlled service.
