#!/usr/bin/env node
import { Command } from 'commander'
import { printBanner } from './output/banner.js'
import { runInspect } from './commands/inspect.js'
import { loadConfig } from './core/config.js'
import { c } from './output/colors.js'
import { CHAINS } from './core/rpc.js'

const program = new Command()

program
  .name('unfold')
  .description('Unfold any EVM contract in seconds')
  .version('0.1.0')
  .argument('<address>', 'EVM contract address')
  .option('--chain <name>', 'Target chain', 'mainnet')
  .option('--rpc <url>', 'Custom RPC URL')
  .option('--json', 'Output as JSON (no banner or interactive menu)')
  .option('--proxy', 'Full proxy analysis')
  .option('--tree', 'Inheritance tree + standards')
  .option('--security', 'Security surface scan')
  .option('--watch <event>', 'Watch contract events live')
  .option('--storage <slot>', 'Read a storage slot or variable name')
  .option('--export <format>', 'Export: foundry | abi | json')
  .action(async (address: string, options: {
    chain: string
    rpc?: string
    json?: boolean
    proxy?: boolean
    tree?: boolean
    security?: boolean
    watch?: string
    storage?: string
    export?: string
  }) => {
    const isJson = options.json === true

    if (!isJson) {
      printBanner()
    }

    const config = loadConfig()

    // Override default chain from config
    const chain = options.chain ?? config.defaultChain ?? 'mainnet'

    if (!CHAINS[chain]) {
      console.error(c.danger(`\n  Unknown chain: "${chain}"`))
      console.error(c.muted(`  Supported: ${Object.keys(CHAINS).join(', ')}\n`))
      process.exit(1)
    }

    if (options.proxy || options.tree || options.security || options.watch || options.storage || options.export) {
      console.log(c.muted(`\n  Advanced flags (--proxy, --tree, --security, etc.) are coming in Phase 2 & 3.\n`))
      console.log(c.muted(`  Running full fingerprint instead...\n`))
    }

    await runInspect(address, chain, config, options.rpc, isJson)
  })

program
  .command('config')
  .description('Manage unfold configuration')
  .command('init')
  .description('Initialize config file')
  .action(async () => {
    const { default: inquirer } = await import('inquirer')
    const { saveConfig } = await import('./core/config.js')

    printBanner()
    console.log(c.muted('  Initializing ~/.unfold/config.json\n'))

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
    ])

    const cfg = {
      defaultChain: answers.defaultChain as string,
      ...(answers.etherscanApiKey ? { etherscanApiKey: answers.etherscanApiKey as string } : {}),
    }

    saveConfig(cfg)
    console.log(c.success('\n  ✓ Config saved to ~/.unfold/config.json\n'))
  })

program.parse()
