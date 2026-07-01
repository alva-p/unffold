import ora from 'ora'
import { getAddress, isAddress } from 'viem'
import { getChainConfig } from '../core/rpc.js'
import { resolveContract } from '../core/resolver.js'
import { tryAnalyzeSource } from '../core/ast-analyzer.js'
import { c } from '../output/colors.js'
import { addressLink } from '../output/links.js'
import type { AbiItem, AbiInput, Config } from '../types.js'

function validateAddress(raw: string): string {
  if (!isAddress(raw)) throw new Error(`Invalid EVM address: ${raw}`)
  return getAddress(raw)
}

function fnSig(item: AbiItem): string {
  const inputs = (item.inputs || []).map(inputType).join(',')
  return `${item.name ?? ''}(${inputs})`
}

function inputType(input: AbiInput): string {
  if (input.type === 'tuple' && input.components) {
    return `(${input.components.map(inputType).join(',')})`
  }
  return input.type
}

function abiMap(abi: AbiItem[], kind: string): Map<string, AbiItem> {
  const map = new Map<string, AbiItem>()
  for (const item of abi) {
    if (item.type === kind && item.name) map.set(fnSig(item), item)
  }
  return map
}

interface DiffSection {
  added: string[]
  removed: string[]
}

function diffMaps(a: Map<string, AbiItem>, b: Map<string, AbiItem>): DiffSection {
  const added: string[] = []
  const removed: string[] = []
  for (const [sig] of b) if (!a.has(sig)) added.push(sig)
  for (const [sig] of a) if (!b.has(sig)) removed.push(sig)
  return { added, removed }
}

function printSection(title: string, diff: DiffSection): boolean {
  const hasChanges = diff.added.length > 0 || diff.removed.length > 0
  if (!hasChanges) return false
  console.log(`\n  ${c.bold(title)}`)
  for (const sig of diff.removed) console.log(`  ${c.danger('-')} ${sig}`)
  for (const sig of diff.added) console.log(`  ${c.success('+')} ${sig}`)
  return true
}

function varNames(source: string | null): Set<string> {
  const analysis = tryAnalyzeSource(source)
  if (!analysis) return new Set()
  return new Set(analysis.stateVariables.map(v => `${v.type} ${v.name}`))
}

export async function runDiff(
  rawA: string,
  rawB: string,
  chainName: string,
  config: Config,
  jsonOutput = false
): Promise<void> {
  const addrA = validateAddress(rawA)
  const addrB = validateAddress(rawB)

  const spinner = jsonOutput ? null : ora({ text: '  Resolving contracts...', spinner: 'arc' }).start()

  try {
    const [contractA, contractB] = await Promise.all([
      resolveContract(addrA, chainName, config),
      resolveContract(addrB, chainName, config),
    ])

    spinner?.stop()

    const abiA = contractA.abi ?? []
    const abiB = contractB.abi ?? []

    const fnDiff  = diffMaps(abiMap(abiA, 'function'), abiMap(abiB, 'function'))
    const evDiff  = diffMaps(abiMap(abiA, 'event'),    abiMap(abiB, 'event'))
    const errDiff = diffMaps(abiMap(abiA, 'error'),    abiMap(abiB, 'error'))

    const varsA = varNames(contractA.sourceCode)
    const varsB = varNames(contractB.sourceCode)
    const varDiff: DiffSection = {
      added:   [...varsB].filter(v => !varsA.has(v)),
      removed: [...varsA].filter(v => !varsB.has(v)),
    }

    if (jsonOutput) {
      console.log(JSON.stringify({
        a: { address: addrA, name: contractA.name, verified: contractA.isVerified },
        b: { address: addrB, name: contractB.name, verified: contractB.isVerified },
        functions: fnDiff,
        events: evDiff,
        errors: errDiff,
        stateVariables: varDiff,
      }, null, 2))
      return
    }

    const shortA = `${addrA.slice(0, 6)}...${addrA.slice(-4)}`
    const shortB = `${addrB.slice(0, 6)}...${addrB.slice(-4)}`
    const chain = getChainConfig(chainName)
    const linkA = c.address(addressLink(shortA, addrA, chain.explorerUrl))
    const linkB = c.address(addressLink(shortB, addrB, chain.explorerUrl))
    console.log()
    console.log(`  ${c.bold('DIFF')}  ${linkA} ${c.muted(contractA.name)}  ${c.dim('→')}  ${linkB} ${c.muted(contractB.name)}  ${c.muted('[' + chainName + ']')}`)
    console.log(c.dim('  ──────────────────────────────────────────────────'))

    if (!contractA.isVerified) console.log(`  ${c.warn('⚠')} ${c.muted(shortA + ' is not verified — ABI may be incomplete')}`)
    if (!contractB.isVerified) console.log(`  ${c.warn('⚠')} ${c.muted(shortB + ' is not verified — ABI may be incomplete')}`)

    let anyChanges = false
    anyChanges = printSection('FUNCTIONS', fnDiff)  || anyChanges
    anyChanges = printSection('EVENTS',    evDiff)  || anyChanges
    anyChanges = printSection('ERRORS',    errDiff) || anyChanges
    anyChanges = printSection('STATE VARIABLES', varDiff) || anyChanges

    if (!anyChanges) {
      console.log(`\n  ${c.success('No ABI or storage differences detected.')}`)
    }

    const totalAdded   = fnDiff.added.length   + evDiff.added.length   + errDiff.added.length   + varDiff.added.length
    const totalRemoved = fnDiff.removed.length  + evDiff.removed.length + errDiff.removed.length + varDiff.removed.length
    if (anyChanges) {
      console.log()
      console.log(`  ${c.muted(`${totalAdded} added, ${totalRemoved} removed`)}`)
    }

    console.log()
  } catch (err) {
    spinner?.fail()
    console.error(`\n  ${c.danger('Error:')} ${(err as Error).message}\n`)
    process.exit(1)
  }
}
