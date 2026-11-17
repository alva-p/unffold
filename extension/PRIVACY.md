# Unffold Extension Privacy

Unffold does not use a backend server and never signs or sends transactions. It does not touch your wallet.

The extension stores these settings in `chrome.storage.local`:

- Etherscan API key (optional)
- default network
- UI language

When you run an analysis, the extension sends the address you entered directly from your browser to the selected chain RPC, Etherscan-compatible APIs (only if you set a key), Sourcify, IPFS, or Arweave as needed. These requests are read-only. The active tab is only scanned locally for visible contract addresses and transaction hashes; page content never leaves your browser.

The **"Wrong verdict? Report it"** link opens a new GitHub issue page. The page is prefilled with the network, the analyzed address, the verdict, the warning IDs and the extension version. Nothing is sent unless you click the link, and nothing is published unless you submit the issue yourself on GitHub.

Unffold does not sell, share, or upload your API key or browsing data to a Unffold-controlled service. It has no analytics or tracking.
