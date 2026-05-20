import ora from 'ora'
import { isAddress, getAddress } from 'viem'
import type { PublicClient } from 'viem'
import { resolveContract } from '../core/resolver.js'
import { resolveProxyChain } from '../core/proxy-detector.js'
import { detectStandards } from '../core/standards.js'
import { printFingerprint } from '../output/fingerprint.js'
import { showMenu } from '../output/menu.js'
import { c } from '../output/colors.js'
import type { Config } from '../types.js'
import { createClient, CHAINS } from '../core/rpc.js'

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
      console.log()
      console.log(`  ${c.warn('⚠ This address has no bytecode — it may be an EOA (wallet), not a contract.')}`)
      console.log()
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
