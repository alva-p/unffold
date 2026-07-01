import ora from 'ora'
import Table from 'cli-table3'
import { getAddress, isAddress } from 'viem'
import { getChainConfig } from '../core/rpc.js'
import { resolveContract } from '../core/resolver.js'
import { detectStandards, standardsToLabels } from '../core/standards.js'
import { buildInheritanceLines, detectOpenZeppelinImports, tryAnalyzeSource } from '../core/ast-analyzer.js'
import { c } from '../output/colors.js'
import { addressLink } from '../output/links.js'
import type { Config } from '../types.js'

function validateAddress(raw: string): string {
  if (!isAddress(raw)) throw new Error(`Invalid EVM address: ${raw}`)
  return getAddress(raw)
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function makeTable(): Table.Table {
  return new Table({
    chars: {
      top: '', 'top-mid': '', 'top-left': '', 'top-right': '',
      bottom: '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': '',
      left: '', 'left-mid': '', mid: '', 'mid-mid': '',
      right: '', 'right-mid': '', middle: '  ',
    },
    style: { 'padding-left': 2, 'padding-right': 0, border: [], head: [] },
  })
}

export async function runTree(
  rawAddress: string,
  chainName: string,
  config: Config,
  jsonOutput = false
): Promise<void> {
  const address = validateAddress(rawAddress)
  const spinner = jsonOutput ? null : ora({ text: `  Building inheritance tree for ${shortAddr(address)}...`, spinner: 'arc' }).start()

  try {
    const chain = getChainConfig(chainName)
    const contract = await resolveContract(address, chainName, config)
    const standards = detectStandards(contract.abi || [], contract.sourceCode)
    const analysis = tryAnalyzeSource(contract.sourceCode)
    spinner?.stop()

    if (jsonOutput) {
      console.log(JSON.stringify({ contract, standards, analysis }, null, 2))
      return
    }

    console.log()
    console.log(`  ${c.bold('INHERITANCE TREE')}  ${c.address(addressLink(shortAddr(address), address, chain.explorerUrl))}  ${c.muted('[' + chainName + ']')}`)
    console.log(c.dim('  ──────────────────────────────────────────────────'))

    if (!analysis) {
      console.log(`  ${c.warn('Source is unavailable or could not be parsed.')}`)
    } else {
      for (const line of buildInheritanceLines(analysis.inheritanceTree, contract.name)) {
        console.log(`  ${line}`)
      }
    }

    console.log()
    console.log(`  ${c.bold('STANDARDS DETECTED')}`)
    const labels = standardsToLabels(standards)
    if (labels.length === 0) {
      console.log(`  ${c.muted('No common ERC standards detected from ABI.')}`)
    } else {
      const standardsTable = makeTable()
      for (const label of labels) standardsTable.push([c.success('yes'), label])
      console.log(standardsTable.toString())
    }

    if (analysis) {
      const ozImports = detectOpenZeppelinImports(analysis.imports)
      console.log()
      console.log(`  ${c.bold('SOURCE SUMMARY')}`)
      const summary = makeTable()
      summary.push([c.muted('contract'), contract.name])
      summary.push([c.muted('verified'), contract.isVerified ? c.success('yes') : c.danger('no')])
      summary.push([c.muted('contracts'), analysis.inheritanceTree.length])
      summary.push([c.muted('functions'), analysis.functions.length])
      summary.push([c.muted('events'), analysis.events.length])
      summary.push([c.muted('errors'), analysis.errors.length])
      if (ozImports.length > 0) {
        summary.push([c.muted('openzeppelin'), ozImports.slice(0, 3).join('  ')])
      }
      console.log(summary.toString())
    }

    console.log()
  } catch (err) {
    spinner?.fail()
    throw err
  }
}
