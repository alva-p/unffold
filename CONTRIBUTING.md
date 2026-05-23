# Contributing to unfold

Thanks for your interest. Here's everything you need to get started.

## Setup

```bash
git clone https://github.com/alva-p/unffold
cd unfold
npm install
npm run build
```

Link it locally so you can test your changes as if it were installed globally:

```bash
npm link
unfold 0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0
```

## Development workflow

```bash
npm run build      # compile TypeScript → dist/
npm run typecheck  # type check without emitting
npm test           # unit tests (no network, ~1s)
npm run test:smoke # integration tests against real RPCs (~15s)
```

Run `npm run build` after every change — the CLI runs from `dist/`, not source.

## Opening a pull request

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run `npm run typecheck && npm test` — both must pass
4. Open a PR with a short description of what and why

For bigger changes (new commands, new proxy patterns, architecture changes), open an issue first to align before writing code.

## Project structure

```
src/
  commands/     one file per CLI flag (inspect, proxy, tree, security, …)
  core/         resolver, rpc client, proxy detector, AST analyzer, standards
  output/       terminal formatting (fingerprint, banner, colors, eoa)
  interactive.ts  interactive menu and loop
  index.ts      CLI entry point (commander)
```

## Notes

- Source lookups use Etherscan API V2 + Sourcify V2 fallback. Set `ETHERSCAN_API_KEY` for smoke tests.
- RPC calls use viem. All chain configs are in `src/core/rpc.ts`.
- The `@inquirer/prompts` API is used for interactive prompts — not the old `inquirer.prompt([{type:'list'}])` style.
