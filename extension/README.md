# Unffold Chrome Extension

MVP extension for manual EVM address checks.

## Local test

```sh
npm run build:extension
```

Then open `chrome://extensions`, enable developer mode, choose **Load unpacked**, and select this `extension/` directory.

The popup stores the Etherscan API key in `chrome.storage.local`. Once saved,
the API key setup panel is hidden and can be reopened from **Settings**.

Current UX:

- dark mode popup
- manual chain/address scan
- default network in Settings
- English, Spanish, and Portuguese UI language
- active-page address detection
- compact Risk Summary
- copyable summary
- pre-interaction checklist
- collapsible warnings with recommendations
