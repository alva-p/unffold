# unfold Project Status

Last updated: 2026-05-20

## Summary

`unfold` is now a working TypeScript CLI prototype for inspecting EVM contracts. It can resolve verified source and ABI, detect standards and proxy patterns, render analysis views, read storage, call view functions, watch events, export artifacts, and handle EOAs.

The implementation is functional enough for local testing and iteration. Before publishing, the main remaining work is hardening edge cases, improving storage/source accuracy, adding tests, and polishing package/release workflow.

## What We Built

### Phase 1 - Core

- CLI entrypoint with `commander`.
- ASCII banner, skipped when `--json` is used.
- Chain support through `viem` public clients.
- Supported chains:
  - `mainnet`
  - `arbitrum`
  - `base`
  - `optimism`
  - `polygon`
  - `zksync`
  - `sepolia`
  - `holesky`
- `--chain <name>` flag.
- `--rpc <url>` override.
- Config loading from:
  - `ETHERSCAN_API_KEY`
  - `~/.unfold/config.json`
- Etherscan API V2 source lookup.
- Sourcify fallback.
- Default fingerprint output.
- ABI-based standard detection.
- Proxy detection for:
  - EIP-1967 / Transparent
  - UUPS
  - Beacon
  - Minimal Proxy
  - Diamond
  - legacy OpenZeppelin transparent pattern
- Proxy chain recursion up to depth 3.
- Basic interactive menu after default inspection.

### Phase 2 - Analysis

- Added Solidity AST analyzer:
  - contracts
  - inheritance parents
  - functions
  - modifiers
  - events
  - custom errors
  - state variables
  - imports
- Added `--tree` command.
- Added `--security` command.
- Added `--proxy` command.
- Added upgrade history lookup from `Upgraded(address)` logs.
- Added OpenZeppelin import detection in tree output.
- Added JSON output for analysis commands.

### Phase 3 - Interaction

- Added `--read <call>`:
  - parses simple function calls such as `name()` or `balanceOf(0x...)`
  - only allows `view` and `pure` calls
  - refuses to send transactions
- Added `--storage <query>`:
  - direct numeric slots
  - hex slots
  - named source variables
  - first-level mappings such as `balanceOf[0x...]`
- Added `--watch <event>`:
  - decoded event watcher through `viem`
  - supports specific event names and `all`
  - Ctrl+C stop handling
- Added `--export <format>`:
  - `foundry`
  - `abi`
  - `json`
- Interactive menu now executes real actions instead of only printing suggested commands.

### Phase 4 - Polish

- Added EOA handling:
  - detects no bytecode
  - prints wallet/EOA output
  - includes balance and nonce
  - supports JSON output
- Improved `config init`:
  - Etherscan API key
  - default chain
  - optional RPC overrides
- Added `README.md`.
- Added `package.json.files` so npm package includes only:
  - `dist`
  - `README.md`
- Verified `npm pack --dry-run` package contents.

## Important Fixes Made

- Etherscan API was initially using deprecated V1-style URLs.
- Confirmed the local `ETHERSCAN_API_KEY` works with Etherscan V2.
- Updated resolver to use Etherscan V2 for Etherscan-family chains.
- Fixed `--chain` default behavior so `defaultChain` from config can actually apply.
- Added package publish filter to prevent generated files like `test/WETH9.t.sol` from being included in npm.

## Files Added

- `README.md`
- `PROJECT_STATUS.md`
- `src/core/ast-analyzer.ts`
- `src/core/storage-layout.ts`
- `src/commands/proxy.ts`
- `src/commands/tree.ts`
- `src/commands/security.ts`
- `src/commands/watch.ts`
- `src/commands/storage.ts`
- `src/commands/read.ts`
- `src/commands/export.ts`
- `src/output/eoa.ts`

## Files Modified

- `package.json`
- `src/index.ts`
- `src/commands/inspect.ts`
- `src/core/config.ts`
- `src/core/resolver.ts`
- `src/types.ts`

`tsconfig.json` was already modified before this work and was left intact.

## Tested Locally

Main test target:

```bash
0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
```

Commands tested:

```bash
npm run build
node dist/index.cjs --help
node dist/index.cjs 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 --read "name()" --json
node dist/index.cjs 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 --read "symbol()" --json
node dist/index.cjs 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 --tree --json
node dist/index.cjs 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 --security --json
node dist/index.cjs 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 --proxy --json
node dist/index.cjs 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 --storage 0 --json
node dist/index.cjs 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 --storage "balanceOf[0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2]" --json
node dist/index.cjs 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 --export abi --json
node dist/index.cjs 0x000000000000000000000000000000000000dEaD --json
npm pack --dry-run
```

Observed results:

- Build passes.
- WETH resolves as verified.
- WETH source and ABI load from Etherscan V2.
- ERC-20 detection works for WETH.
- `--read` returns expected values.
- Mapping storage slot computation returns non-zero data for WETH balance query.
- WETH correctly reports no proxy.
- EOA output works with balance and nonce.
- npm dry-run package contains only intended publish files.

## What Still Needs To Be Done

### Required Before Publishing

- Add automated tests.
- Add linting or typecheck script.
- Decide whether to commit or delete generated `test/WETH9.t.sol`.
- Confirm package name availability on npm.
- Add release workflow or documented manual publish steps.
- Add license file if publishing as MIT.
- Add `.npmignore` only if needed. Current `files` field is probably enough.
- Verify behavior when no `ETHERSCAN_API_KEY` is set.
- Verify behavior with rate limits and malformed API responses.
- Verify across all supported chains.

### Functional Gaps

- Storage layout is best-effort only.
- Named storage slots are inferred from source declaration order, not Solidity compiler storage layout metadata.
- Packed storage variables are not decoded.
- Structs, arrays, nested mappings, inheritance storage ordering, and upgradeable storage gaps are not fully supported.
- `--read` parser only supports simple comma-separated args.
- `--read` does not support arrays, tuples, bytes literals with complex escaping, or overloaded functions beyond arg count.
- `--watch` depends on RPC support for event subscriptions/polling behavior.
- Event formatting is generic and does not yet use token decimals/symbol metadata.
- Foundry export is basic.
- Foundry export can produce imperfect interfaces for tuple-heavy ABIs.
- Proxy upgrade history only reads `Upgraded(address)` on the proxy address.
- Proxy history does not yet decode admin changes or beacon upgrades.
- Diamond support only detects the pattern; it does not enumerate facets.
- Security scan is heuristic and source-string based in places.
- Security scan does not prove access-control correctness.
- Security scan does not inspect bytecode for opcodes.
- Security scan does not detect timelocks, multisigs, or governance labels.

### UX Improvements

- Improve terminal output spacing and tables for all advanced commands.
- Add short-address plus full-address toggles.
- Add explorer links in proxy/tree/security outputs.
- Add better messages when ABI/source is unavailable.
- Add suggestions for setting `ETHERSCAN_API_KEY`.
- Add `unfold config show`.
- Add `unfold config set`.
- Add `unfold config path`.
- Add `--no-menu` option.
- Add `--quiet` option.
- Add `--output <path>` for exports.
- Add readable token amount formatting using decimals/symbol.
- Add JSON schema consistency across commands.

### Reliability Improvements

- Centralize address validation.
- Centralize command error handling.
- Avoid duplicate resolver calls across chained actions.
- Add timeout handling for RPC and explorer calls.
- Add retry/backoff for RPC failures.
- Improve Sourcify fallback coverage.
- Cache resolved ABI/source per address and chain.
- Handle Etherscan V2 endpoints per chain more explicitly.
- Add support for custom explorer API URLs in config.
- Avoid loading huge source blobs into JSON unless requested.

### Code Quality Improvements

- Split CLI routing from command implementation.
- Add unit tests for:
  - standards detection
  - storage slot computation
  - read-call parser
  - AST analyzer
  - proxy slot decoding
- Add integration tests with mocked fetch/RPC.
- Add a `typecheck` script.
- Add a `test` script.
- Add CI.
- Consider moving shared command setup into a context object:
  - address
  - chain config
  - viem client
  - resolved contract
  - proxy info
- Avoid casting ABI to `never` in read/watch commands by using stronger viem-compatible ABI types.

## Suggested Next Steps

1. Clean working tree:
   - decide what to do with `test/WETH9.t.sol`
   - review `tsconfig.json` changes
2. Add test tooling:
   - Vitest or Node test runner
   - `npm run typecheck`
3. Write unit tests for the riskiest logic:
   - storage mappings
   - function-call parsing
   - standards detection
4. Improve error messages for missing API key and unverified contracts.
5. Run a multi-chain smoke test:
   - mainnet WETH
   - wstETH proxy
   - Base verified ERC-20
   - Arbitrum verified proxy
   - Sepolia sample contract
6. Add `LICENSE`.
7. Decide publish package metadata:
   - repository URL
   - homepage
   - bugs URL
8. Publish only after `npm pack --dry-run` and local `npm link` testing.

## Current Publish Readiness

Status: not ready for public npm release.

Reason:

- Core features work locally.
- Package contents are controlled.
- README exists.
- But tests, CI, release metadata, and edge-case hardening are still missing.

Recommended release path:

1. Treat current state as prototype/MVP.
2. Add tests and a small CI workflow.
3. Publish a tagged prerelease only after multi-chain smoke testing.
