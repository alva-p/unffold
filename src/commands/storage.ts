import ora from 'ora'
import { getAddress, isAddress } from 'viem'
import { createClient } from '../core/rpc.js'
import { resolveContract } from '../core/resolver.js'
import { decodeStorageValue, findStorageSlot } from '../core/storage-layout.js'
import { c } from '../output/colors.js'
import type { Config } from '../types.js'

function validateAddress(raw: string): string {
  if (!isAddress(raw)) throw new Error(`Invalid EVM address: ${raw}`)
  return getAddress(raw)
}

export async function runStorage(
  rawAddress: string,
  query: string,
  chainName: string,
  config: Config,
  rpcOverride?: string,
  jsonOutput = false
): Promise<void> {
  const address = validateAddress(rawAddress)
  const spinner = jsonOutput ? null : ora({ text: `  Reading storage ${c.address(query)}...`, spinner: 'arc' }).start()

  try {
    const [contract, client] = await Promise.all([
      resolveContract(address, chainName, config),
      Promise.resolve(createClient(chainName, config, rpcOverride)),
    ])
    const lookup = findStorageSlot(contract.sourceCode, query)
    if (!lookup) throw new Error(`Could not resolve storage query: ${query}`)

    const raw = await client.getStorageAt({ address: address as `0x${string}`, slot: lookup.slot })
    const decoded = decodeStorageValue(raw, lookup.variable)

    spinner?.stop()
    if (jsonOutput) {
      console.log(JSON.stringify({ query, ...lookup, raw, decoded }, null, 2))
      return
    }

    console.log()
    console.log(`  ${c.bold('STORAGE')}`)
    console.log(c.dim('  ──────────────────────────────────────────────────'))
    if (lookup.variable) console.log(`  ${c.muted('variable')}  ${lookup.variable.name}`)
    if (lookup.mappingKey) console.log(`  ${c.muted('key')}       ${lookup.mappingKey}`)
    console.log(`  ${c.muted('slot')}      ${lookup.slot}`)
    console.log(`  ${c.muted('raw')}       ${raw || '0x'}`)
    console.log(`  ${c.muted('decoded')}   ${decoded}`)
    console.log()
  } catch (err) {
    spinner?.fail()
    console.error(`\n  ${c.danger('Error:')} ${(err as Error).message}\n`)
    process.exit(1)
  }
}
