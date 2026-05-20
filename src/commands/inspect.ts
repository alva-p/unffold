import ora from 'ora'
import { isAddress, getAddress } from 'viem'
import type { PublicClient } from 'viem'
import { resolveContract } from '../core/resolver.js'
import { resolveProxyChain } from '../core/proxy-detector.js'
import { detectStandards } from '../core/standards.js'
import { printFingerprint } from '../output/fingerprint.js'
import { showMenu } from '../output/menu.js'
import { c } from '../output/colors.js'
import { printEoaInfo } from '../output/eoa.js'
import type { Config } from '../types.js'
import { createClient, CHAINS } from '../core/rpc.js'
import { runExport } from './export.js'
import { runProxy } from './proxy.js'
import { runRead } from './read.js'
import { runSecurity } from './security.js'
import { runStorage } from './storage.js'
import { runTree } from './tree.js'
import { runWatch } from './watch.js'

function validateAddress(raw: string): string {
  if (!isAddress(raw)) {
    throw new Error(`Invalid EVM address: ${raw}`)
  }
  return getAddress(raw)
}

async function checkIsContract(client: PublicClient, address: `0x${string}`): Promise<boolean> {
  const code = await client.getBytecode({ address })
  return !!code && code !== '0x'
}

export async function runInspect(
  rawAddress: string,
  chainName: string,
  config: Config,
  rpcOverride?: string,
  jsonOutput = false
): Promise<void> {
  let address: string
  try {
    address = validateAddress(rawAddress)
  } catch (err) {
    console.error(`\n  ${c.danger('Error:')} ${(err as Error).message}\n`)
    process.exit(1)
    return
  }

  const chainConfig = CHAINS[chainName]
  if (!chainConfig) {
    console.error(c.danger(`Unknown chain: ${chainName}`))
    process.exit(1)
    return
  }

  const spinner = jsonOutput ? null : ora({
    text: `  Resolving ${c.address(address.slice(0, 6) + '...' + address.slice(-4))} on ${chainConfig.name}...`,
    spinner: 'dots',
  }).start()

  try {
    const client = createClient(chainName, config, rpcOverride)

    const [isContract, contract] = await Promise.all([
      checkIsContract(client, address as `0x${string}`),
      resolveContract(address, chainName, config),
    ])

    if (!isContract) {
      spinner?.stop()
      let balance: bigint | undefined
      let transactionCount: number | undefined
      try {
        [balance, transactionCount] = await Promise.all([
          client.getBalance({ address: address as `0x${string}` }),
          client.getTransactionCount({ address: address as `0x${string}` }),
        ])
      } catch {
        // keep the EOA output useful even if one RPC method fails
      }

      if (jsonOutput) {
        console.log(JSON.stringify({
          address,
          chain: chainConfig.name,
          type: 'eoa',
          balance: balance?.toString() ?? null,
          transactionCount: transactionCount ?? null,
        }, null, 2))
        return
      }

      printEoaInfo(address, chainConfig.name, balance, transactionCount)
      return
    }

    const proxy = await resolveProxyChain(address, contract.abi, client)

    if (proxy) {
      contract.isProxy = true
      contract.implementationAddress = proxy.implementationAddress
      if (!contract.implementationName) {
        try {
          const impl = await resolveContract(proxy.implementationAddress, chainName, config)
          contract.implementationName = impl.name
        } catch {
          // ignore
        }
      }
    }

    const standards = detectStandards(contract.abi || [], contract.sourceCode)

    let balance: bigint | undefined
    try {
      balance = await client.getBalance({ address: address as `0x${string}` })
    } catch {
      // ignore
    }

    spinner?.stop()
    console.log()

    if (jsonOutput) {
      console.log(JSON.stringify({ contract, proxy, standards }, null, 2))
      return
    }

    printFingerprint(contract, proxy, standards, chainConfig.name, balance)

    const action = await showMenu()
    if (!action || action === 'exit') return

    if (action === 'proxy') return runProxy(address, chainName, config, rpcOverride, jsonOutput)
    if (action === 'tree') return runTree(address, chainName, config, jsonOutput)
    if (action === 'security') return runSecurity(address, chainName, config, rpcOverride, jsonOutput)
    if (action === 'export') return runExport(address, 'foundry', chainName, config, jsonOutput)

    if (action === 'storage' || action === 'watch' || action === 'read') {
      const { default: inquirer } = await import('inquirer')
      const answer = await inquirer.prompt([{
        type: 'input',
        name: 'value',
        message: action === 'storage'
          ? 'Storage slot/name/mapping:'
          : action === 'watch'
            ? 'Event name (or all):'
            : 'View call:',
        default: action === 'watch' ? 'all' : undefined,
      }])
      const value = String(answer.value || '').trim()
      if (!value) return
      if (action === 'storage') return runStorage(address, value, chainName, config, rpcOverride, jsonOutput)
      if (action === 'watch') return runWatch(address, value, chainName, config, rpcOverride)
      return runRead(address, value, chainName, config, rpcOverride, jsonOutput)
    }

    if (action === 'etherscan') {
      const baseUrl = chainConfig.explorerApiUrl.replace('/api', '')
      console.log(`\n  ${c.address(baseUrl + '/address/' + address)}\n`)
      return
    }

    console.log(c.muted(`\n  Run: unfold ${address} --${action}\n`))
  } catch (err) {
    spinner?.fail()
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`\n  ${c.danger('Error:')} ${msg}\n`)
    process.exit(1)
  }
}
