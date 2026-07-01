import ora from 'ora'
import { getAddress, isAddress, toFunctionSelector } from 'viem'
import { createClient, getChainConfig } from '../core/rpc.js'
import { resolveContract } from '../core/resolver.js'
import { c } from '../output/colors.js'
import { addressLink } from '../output/links.js'
import type { AbiItem, AbiInput, Config } from '../types.js'

function validateAddress(raw: string): string {
  if (!isAddress(raw)) throw new Error(`Invalid EVM address: ${raw}`)
  return getAddress(raw)
}

const FACETS_ABI = [
  {
    type: 'function',
    name: 'facets',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'facetAddress', type: 'address' },
          { name: 'functionSelectors', type: 'bytes4[]' },
        ],
      },
    ],
    stateMutability: 'view',
  },
] as const

type FacetRaw = { facetAddress: string; functionSelectors: readonly string[] }

function inputType(input: AbiInput): string {
  if (input.type === 'tuple' && input.components) {
    return `(${input.components.map(inputType).join(',')})`
  }
  return input.type
}

function buildSelectorMap(abi: AbiItem[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const item of abi) {
    if (item.type !== 'function' || !item.name) continue
    try {
      const sig = `${item.name}(${(item.inputs || []).map(inputType).join(',')})`
      const sel = toFunctionSelector(sig)
      map.set(sel, item.name)
    } catch {
      // skip if selector computation fails
    }
  }
  return map
}

export async function runFacets(
  rawAddress: string,
  chainName: string,
  config: Config,
  rpcOverride?: string,
  jsonOutput = false
): Promise<void> {
  const address = validateAddress(rawAddress)
  const spinner = jsonOutput ? null : ora({ text: '  Loading diamond facets...', spinner: 'arc' }).start()

  try {
    const client = createClient(chainName, config, rpcOverride)

    const rawFacets = await client.readContract({
      address: address as `0x${string}`,
      abi: FACETS_ABI,
      functionName: 'facets',
    }) as FacetRaw[]

    const total = rawFacets.length
    let done = 0
    const updateBar = () => {
      if (!spinner) return
      const filled = Math.round((done / total) * 12)
      const bar = '█'.repeat(filled) + '░'.repeat(12 - filled)
      spinner.text = `  [${bar}] ${done}/${total} facets resolved`
    }
    updateBar()

    const resolved = await Promise.all(
      rawFacets.map(async (facet) => {
        const contract = await resolveContract(facet.facetAddress, chainName, config).catch(() => null)
        const selectorMap = contract?.abi ? buildSelectorMap(contract.abi) : new Map<string, string>()
        const functions = Array.from(facet.functionSelectors).map(sel => ({
          selector: sel,
          name: selectorMap.get(sel) ?? null,
        }))
        done++
        updateBar()
        return {
          facetAddress: facet.facetAddress,
          name: contract?.name ?? 'Unknown',
          verified: contract?.isVerified ?? false,
          functions,
        }
      })
    )

    spinner?.stop()

    if (jsonOutput) {
      console.log(JSON.stringify(resolved, null, 2))
      return
    }

    const short = `${address.slice(0, 6)}...${address.slice(-4)}`
    const chain = getChainConfig(chainName)
    const linkedDiamond = c.address(addressLink(short, address, chain.explorerUrl))
    console.log()
    console.log(`  ${c.bold('DIAMOND FACETS')}  ${linkedDiamond}  ${c.muted('[' + chainName + ']')}`)
    console.log(c.dim('  ──────────────────────────────────────────────────'))

    for (const facet of resolved) {
      const addr = `${facet.facetAddress.slice(0, 6)}...${facet.facetAddress.slice(-4)}`
      const verified = facet.verified ? '' : c.muted(' (unverified)')
      console.log()
      console.log(`  ${c.address(addressLink(addr, facet.facetAddress, chain.explorerUrl))}  ${c.bold(facet.name)}${verified}`)
      for (const fn of facet.functions) {
        const name = fn.name ? fn.name : c.muted('(unknown)')
        console.log(`    ${c.muted(fn.selector)}  ${name}`)
      }
    }

    const totalSelectors = resolved.reduce((n, f) => n + f.functions.length, 0)
    console.log()
    console.log(`  ${c.muted(`${resolved.length} facets · ${totalSelectors} selectors`)}`)
    console.log()
  } catch (err) {
    spinner?.fail()
    console.error(`\n  ${c.danger('Error:')} ${(err as Error).message}\n`)
    process.exit(1)
  }
}
