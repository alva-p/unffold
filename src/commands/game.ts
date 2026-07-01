import ora from 'ora'
import Table from 'cli-table3'
import type { OverallRisk, RiskSeverity } from '../core/risk-summary.js'
import { analyzeGameProfile, gameControlsLine } from '../core/profiles/game-profile.js'
import { c } from '../output/colors.js'
import { addressLink } from '../output/links.js'
import type { Config } from '../types.js'

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
    wordWrap: true,
  })
}

function riskLabel(risk: OverallRisk): string {
  if (risk === 'low') return c.success('low')
  if (risk === 'medium') return c.warn('medium')
  return c.danger('high')
}

function severityLabel(severity: RiskSeverity): string {
  if (severity === 'ok') return c.success('ok')
  if (severity === 'info') return c.muted('info')
  if (severity === 'medium') return c.warn('medium')
  return c.danger('high')
}

export async function runGame(
  rawAddress: string,
  chainName: string,
  config: Config,
  rpcOverride?: string,
  jsonOutput = false
): Promise<void> {
  const spinner = jsonOutput ? null : ora({ text: `  Analyzing game ${shortAddr(rawAddress)}...`, spinner: 'arc' }).start()

  try {
    const result = await analyzeGameProfile(rawAddress, chainName, config, rpcOverride)
    const { address, contract, game, riskSummary } = result

    spinner?.stop()

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2))
      return
    }

    const explorerBase = result.report.links.find(link => link.label === 'Explorer')?.url.replace(address, '') ?? ''

    console.log()
    console.log(`  ${c.bold('GAME ANALYSIS')}  ${c.address(addressLink(shortAddr(address), address, explorerBase))}  ${c.muted('[' + chainName + ']')}`)
    console.log(c.dim('  ──────────────────────────────────────────────────'))

    const identity = makeTable()
    identity.push([c.muted('name'), contract.name])
    identity.push([c.muted('source'), contract.verified ? c.success('verified') : c.danger('unverified')])
    identity.push([c.muted('standards'), riskSummary.standards.length > 0 ? riskSummary.standards.join(', ') : c.muted('unknown')])
    identity.push([c.muted('proxy'), riskSummary.proxy.detected ? c.warn(riskSummary.proxy.pattern ?? 'detected') : c.success('not detected')])
    console.log(identity.toString())

    console.log()
    console.log(`  ${c.bold('GAME CONTROLS')}`)
    const controls = makeTable()
    controls.push([c.muted('controls'), gameControlsLine(game.controls)])
    for (const [key, names] of Object.entries(game.controls)) {
      if (names.length > 0) controls.push([c.muted(key), names.slice(0, 8).join(', ')])
    }
    console.log(controls.toString())

    console.log()
    console.log(`  ${c.bold('RISK SUMMARY')}`)
    const summary = makeTable()
    summary.push([c.muted('overall'), riskLabel(riskSummary.overall)])
    summary.push([c.muted('score'), `${riskSummary.score}/100`])
    summary.push([c.muted('summary'), riskSummary.summary])
    summary.push([c.muted('main reason'), riskSummary.mainReason])
    console.log(summary.toString())

    console.log()
    console.log(`  ${c.bold('SIGNALS')}`)
    const signals = makeTable()
    for (const signal of riskSummary.signals) signals.push([severityLabel(signal.severity), signal.label, signal.whyItMatters])
    console.log(signals.toString())

    const actionable = riskSummary.signals.filter(signal => signal.severity === 'high' || signal.severity === 'medium')
    if (actionable.length > 0) {
      console.log()
      console.log(`  ${c.bold('WHAT TO CHECK')}`)
      const checks = makeTable()
      for (const signal of actionable.slice(0, 5)) checks.push([c.muted(signal.label), signal.recommendation])
      console.log(checks.toString())
    }
    console.log()
  } catch (err) {
    spinner?.fail()
    console.error(`\n  ${c.danger('Error:')} ${(err as Error).message}\n`)
    process.exit(1)
  }
}
