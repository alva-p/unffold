#!/usr/bin/env node
import { exec } from 'child_process'
import { Command } from 'commander'
import { printBanner } from './output/banner.js'
import { runInspect } from './commands/inspect.js'
import { runExport } from './commands/export.js'
import { runProxy } from './commands/proxy.js'
import { runRead } from './commands/read.js'
import { runSecurity } from './commands/security.js'
import { runStorage } from './commands/storage.js'
import { runTree } from './commands/tree.js'
import { runWatch } from './commands/watch.js'
import { runDiff } from './commands/diff.js'
import { runFacets } from './commands/facets.js'
import { runTrace } from './commands/trace.js'
import { runToken } from './commands/token.js'
import { runVault } from './commands/vault.js'
import { runNft } from './commands/nft.js'
import { runGame } from './commands/game.js'
import { runAnalyze } from './commands/analyze.js'
import { loadConfig } from './core/config.js'
import { runInteractive } from './interactive.js'
import { c } from './output/colors.js'
import { hyperlink } from './output/links.js'
import { CHAINS } from './core/rpc.js'

const program = new Command()
const ETHERSCAN_API_DASHBOARD_URL = 'https://etherscan.io/apidashboard'

function optionChain(options: { chain?: string }, config: ReturnType<typeof loadConfig>): string {
  return options.chain ?? program.opts<{ chain?: string }>().chain ?? config.defaultChain ?? 'mainnet'
}

function optionRpc(options: { rpc?: string }): string | undefined {
  return options.rpc ?? program.opts<{ rpc?: string }>().rpc
}

function openExternalUrl(url: string): void {
  const cmd = process.platform === 'darwin'
    ? `open "${url}"`
    : process.platform === 'win32'
      ? `start "" "${url}"`
      : `xdg-open "${url}"`
  exec(cmd)
}

program
  .name('unffold')
  .description('Unfold any EVM contract in seconds')
  .version('0.1.0')
  .argument('[address]', 'EVM contract address (omit to enter interactive mode)')
  .option('--chain <name>', 'Target chain')
  .option('--rpc <url>', 'Custom RPC URL')
  .option('--json', 'Output as JSON (no banner or interactive menu)')
  .option('--no-menu', 'Do not open the interactive menu after inspect')
  .option('--quiet', 'Hide banner and inspect progress lines')
  .option('--simple', 'Print a short non-technical summary')
  .option('--proxy', 'Full proxy analysis')
  .option('--tree', 'Inheritance tree + standards')
  .option('--security', 'Security surface scan')
  .option('--watch <event>', 'Watch contract events live')
  .option('--storage <slot>', 'Read a storage slot or variable name')
  .option('--read <call>', 'Call any view function, e.g. balanceOf(0x...)')
  .option('--export <format>', 'Export: foundry | abi | json')
  .option('--output <path>', 'Destination directory for --export (default: current dir)')
  .option('--facets', 'Enumerate Diamond (EIP-2535) facets via diamondLoupe')
  .action(async (address: string | undefined, options: {
    chain?: string
    rpc?: string
    json?: boolean
    noMenu?: boolean
    quiet?: boolean
    simple?: boolean
    proxy?: boolean
    tree?: boolean
    security?: boolean
    watch?: string
    storage?: string
    read?: string
    export?: string
    output?: string
    facets?: boolean
  }) => {
    const isJson = options.json === true
    const isQuiet = options.quiet === true

    if (!isJson && !isQuiet) printBanner()

    const config = loadConfig()
    const chain = options.chain ?? config.defaultChain ?? 'mainnet'

    // No address → full interactive mode
    if (!address) {
      await runInteractive(config)
      return
    }

    if (!CHAINS[chain]) {
      console.error(c.danger(`\n  Unknown chain: "${chain}"`))
      console.error(c.muted(`  Supported: ${Object.keys(CHAINS).join(', ')}\n`))
      process.exit(1)
    }

    if (options.proxy)   { await runProxy(address, chain, config, options.rpc, isJson); return }
    if (options.tree)    { await runTree(address, chain, config, isJson); return }
    if (options.security){ await runSecurity(address, chain, config, options.rpc, isJson); return }
    if (options.watch)   { await runWatch(address, options.watch, chain, config, options.rpc); return }
    if (options.storage) { await runStorage(address, options.storage, chain, config, options.rpc, isJson); return }
    if (options.read)    { await runRead(address, options.read, chain, config, options.rpc, isJson); return }
    if (options.export)  { await runExport(address, options.export, chain, config, isJson, options.output); return }
    if (options.facets)  { await runFacets(address, chain, config, options.rpc, isJson); return }

    const startLoop = !isJson && !isQuiet && options.noMenu !== true && options.simple !== true
    await runInspect(address, chain, config, options.rpc, isJson, startLoop, isQuiet, options.simple === true)
  })

const configCmd = program
  .command('config')
  .description('Manage unfold configuration')

configCmd
  .command('init')
  .description('Initialize config file via wizard')
  .action(async () => {
    const { default: inquirer } = await import('inquirer')
    const { getConfigPath, saveConfig } = await import('./core/config.js')

    printBanner()
    console.log(c.muted('  Initializing ~/.unfold/config.json\n'))
    console.log(`  ${c.bold('Etherscan API key')}`)
    console.log(`  ${c.muted('unffold can fall back to Sourcify, but an Etherscan API key makes verified-source lookups more reliable across supported EVM chains.')}`)
    console.log(`  ${c.muted('Create or copy your key here:')} ${c.address(hyperlink(ETHERSCAN_API_DASHBOARD_URL, ETHERSCAN_API_DASHBOARD_URL))}\n`)

    const setupAnswers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'openEtherscanDashboard',
        message: 'Open the Etherscan API dashboard in your browser?',
        default: false,
      },
    ])

    if (setupAnswers.openEtherscanDashboard === true) {
      openExternalUrl(ETHERSCAN_API_DASHBOARD_URL)
      console.log(c.muted(`  Opened ${ETHERSCAN_API_DASHBOARD_URL}\n`))
    }

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'etherscanApiKey',
        message: 'Etherscan API key (leave blank to skip):',
      },
      {
        type: 'list',
        name: 'defaultChain',
        message: 'Default chain:',
        choices: Object.keys(CHAINS),
        default: 'mainnet',
      },
      {
        type: 'confirm',
        name: 'addRpcOverrides',
        message: 'Add custom RPC URLs now?',
        default: false,
      },
      {
        type: 'checkbox',
        name: 'rpcChains',
        message: 'Chains to configure:',
        choices: Object.keys(CHAINS),
        when: (a: Record<string, unknown>) => a.addRpcOverrides === true,
      },
    ])

    const rpcOverrides: Record<string, string> = {}
    for (const chainName of answers.rpcChains || []) {
      const answer = await inquirer.prompt([{
        type: 'input',
        name: 'rpcUrl',
        message: `${chainName} RPC URL:`,
        validate: (value: string) => value.startsWith('http://') || value.startsWith('https://') ? true : 'Enter an http(s) URL',
      }])
      if (answer.rpcUrl) rpcOverrides[chainName as string] = answer.rpcUrl as string
    }

    const cfg = {
      defaultChain: answers.defaultChain as string,
      ...(answers.etherscanApiKey ? { etherscanApiKey: answers.etherscanApiKey as string } : {}),
      ...(Object.keys(rpcOverrides).length > 0 ? { rpcOverrides } : {}),
    }

    saveConfig(cfg)
    console.log(c.success(`\n  ✓ Config saved to ${getConfigPath()}\n`))
  })

configCmd
  .command('show')
  .description('Print current config')
  .action(() => {
    const { getConfigPath, loadConfig } = require('./core/config.js') as typeof import('./core/config.js')
    const cfg = loadConfig()
    console.log()
    console.log(`  ${c.bold('CONFIG')}  ${c.muted(getConfigPath())}`)
    console.log(c.dim('  ──────────────────────────────────────────────────'))
    const entries = Object.entries(cfg)
    if (entries.length === 0) {
      console.log(c.muted('  (empty — run `unffold config init` to set up)'))
    } else {
      for (const [key, val] of entries) {
        const display = typeof val === 'object' ? JSON.stringify(val) : String(val)
        console.log(`  ${c.muted(key.padEnd(20))} ${display}`)
      }
    }
    console.log()
  })

configCmd
  .command('set <key> <value>')
  .description('Set a config value (e.g. defaultChain mainnet)')
  .action((key: string, value: string) => {
    const { loadConfig, saveConfig, getConfigPath } = require('./core/config.js') as typeof import('./core/config.js')
    const VALID_KEYS = ['etherscanApiKey', 'defaultChain']
    if (!VALID_KEYS.includes(key) && !key.startsWith('rpcOverrides.')) {
      console.error(c.danger(`\n  Unknown key "${key}". Valid: ${VALID_KEYS.join(', ')}, rpcOverrides.<chain>\n`))
      process.exit(1)
    }
    const cfg = loadConfig()
    if (key.startsWith('rpcOverrides.')) {
      const chain = key.slice('rpcOverrides.'.length)
      cfg.rpcOverrides = { ...(cfg.rpcOverrides ?? {}), [chain]: value }
    } else {
      (cfg as Record<string, unknown>)[key] = value
    }
    saveConfig(cfg)
    console.log(c.success(`\n  ✓ ${key} = ${value}  (${getConfigPath()})\n`))
  })

configCmd
  .command('path')
  .description('Print the config file path')
  .action(() => {
    const { getConfigPath } = require('./core/config.js') as typeof import('./core/config.js')
    console.log(getConfigPath())
  })

program
  .command('diff <address1> <address2>')
  .description('Compare ABI and storage layout between two contracts')
  .option('--chain <name>', 'Target chain (default: mainnet)')
  .option('--json', 'Output as JSON')
  .action(async (address1: string, address2: string, options: { chain?: string; json?: boolean }) => {
    const jsonOutput = options.json === true || program.opts<{ json?: boolean }>().json === true
    if (!jsonOutput) printBanner()
    const config = loadConfig()
    const chain = optionChain(options, config)
    await runDiff(address1, address2, chain, config, jsonOutput)
  })

program
  .command('trace <txhash>')
  .description('Decode calldata and events of a transaction')
  .option('--chain <name>', 'Target chain (default: mainnet)')
  .option('--rpc <url>', 'Custom RPC URL')
  .option('--json', 'Output as JSON')
  .action(async (txhash: string, options: { chain?: string; rpc?: string; json?: boolean }) => {
    const jsonOutput = options.json === true || program.opts<{ json?: boolean }>().json === true
    if (!jsonOutput) printBanner()
    const config = loadConfig()
    const chain = optionChain(options, config)
    await runTrace(txhash, chain, config, optionRpc(options), jsonOutput)
  })

program
  .command('analyze <address>')
  .description('Auto-detect the best profile and return a UI-ready report')
  .option('--chain <name>', 'Target chain (default: mainnet)')
  .option('--rpc <url>', 'Custom RPC URL')
  .option('--json', 'Output as JSON')
  .action(async (address: string, options: { chain?: string; rpc?: string; json?: boolean }) => {
    const jsonOutput = options.json === true || program.opts<{ json?: boolean }>().json === true
    if (!jsonOutput) printBanner()
    const config = loadConfig()
    const chain = optionChain(options, config)
    await runAnalyze(address, chain, config, optionRpc(options), jsonOutput)
  })

program
  .command('token <address>')
  .description('Token-focused risk summary for ERC-20-style contracts')
  .option('--chain <name>', 'Target chain (default: mainnet)')
  .option('--rpc <url>', 'Custom RPC URL')
  .option('--json', 'Output as JSON')
  .action(async (address: string, options: { chain?: string; rpc?: string; json?: boolean }) => {
    const jsonOutput = options.json === true || program.opts<{ json?: boolean }>().json === true
    if (!jsonOutput) printBanner()
    const config = loadConfig()
    const chain = optionChain(options, config)
    await runToken(address, chain, config, optionRpc(options), jsonOutput)
  })

program
  .command('proxy <address>')
  .description('Proxy-focused upgradeability and admin risk summary')
  .option('--chain <name>', 'Target chain (default: mainnet)')
  .option('--rpc <url>', 'Custom RPC URL')
  .option('--json', 'Output as JSON')
  .action(async (address: string, options: { chain?: string; rpc?: string; json?: boolean }) => {
    const jsonOutput = options.json === true || program.opts<{ json?: boolean }>().json === true
    if (!jsonOutput) printBanner()
    const config = loadConfig()
    const chain = optionChain(options, config)
    await runProxy(address, chain, config, optionRpc(options), jsonOutput)
  })

program
  .command('vault <address>')
  .description('ERC-4626-focused vault metadata and risk summary')
  .option('--chain <name>', 'Target chain (default: mainnet)')
  .option('--rpc <url>', 'Custom RPC URL')
  .option('--json', 'Output as JSON')
  .action(async (address: string, options: { chain?: string; rpc?: string; json?: boolean }) => {
    const jsonOutput = options.json === true || program.opts<{ json?: boolean }>().json === true
    if (!jsonOutput) printBanner()
    const config = loadConfig()
    const chain = optionChain(options, config)
    await runVault(address, chain, config, optionRpc(options), jsonOutput)
  })

program
  .command('nft <address>')
  .description('NFT collection metadata and risk summary')
  .option('--chain <name>', 'Target chain (default: mainnet)')
  .option('--rpc <url>', 'Custom RPC URL')
  .option('--json', 'Output as JSON')
  .action(async (address: string, options: { chain?: string; rpc?: string; json?: boolean }) => {
    const jsonOutput = options.json === true || program.opts<{ json?: boolean }>().json === true
    if (!jsonOutput) printBanner()
    const config = loadConfig()
    const chain = optionChain(options, config)
    await runNft(address, chain, config, optionRpc(options), jsonOutput)
  })

program
  .command('game <address>')
  .description('Game / on-chain app risk summary')
  .option('--chain <name>', 'Target chain (default: mainnet)')
  .option('--rpc <url>', 'Custom RPC URL')
  .option('--json', 'Output as JSON')
  .action(async (address: string, options: { chain?: string; rpc?: string; json?: boolean }) => {
    const jsonOutput = options.json === true || program.opts<{ json?: boolean }>().json === true
    if (!jsonOutput) printBanner()
    const config = loadConfig()
    const chain = optionChain(options, config)
    await runGame(address, chain, config, optionRpc(options), jsonOutput)
  })

program.parse()
