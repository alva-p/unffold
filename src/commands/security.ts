import ora from 'ora'
import { atLeast, COVERAGE, docsUrl, scanSecurity, type Finding, type SecurityScan, type Severity } from '../core/security-checks.js'
import { findingLocation } from '../core/security-report.js'
import { c } from '../output/colors.js'
import { addressLink } from '../output/links.js'
import { toSarif } from '../output/sarif.js'
import { toMarkdown } from '../output/markdown.js'
import { knownBadge } from '../core/known-tokens.js'
import { applyBaseline, loadBaseline, updateBaseline } from '../core/baseline.js'
import type { Config } from '../types.js'

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

const SEVERITY_COLOR: Record<Severity, (text: string) => string> = {
  high: c.danger,
  medium: c.warn,
  low: c.muted,
  info: c.dim,
}

const INDENT = ' '.repeat(10)

function severityTag(severity: Severity): string {
  return SEVERITY_COLOR[severity](severity.toUpperCase().padEnd(8))
}

function whereLine(finding: Finding): string {
  const location = findingLocation(finding)
  if (!location) return ''
  return `${INDENT}${c.address(location)}${finding.code ? `  ${c.dim(finding.code)}` : ''}`
}

function explain(finding: Finding): void {
  console.log(`${INDENT}${finding.detail}`)
  console.log(`${INDENT}${c.muted('verify: ' + finding.recommendation)}`)
  console.log(`${INDENT}${c.dim('false positive if: ' + finding.falsePositives)}`)
  console.log(`${INDENT}${c.dim('docs: ' + docsUrl(finding.id))}`)
}

// Consecutive findings with the same id share one header (findings are sorted by severity).
function groups(findings: Finding[]): Finding[][] {
  const out: Finding[][] = []
  for (const finding of findings) {
    const last = out[out.length - 1]
    if (last && last[0].id === finding.id) last.push(finding)
    else out.push([finding])
  }
  return out
}

function printFindings(findings: Finding[], verbose: boolean): void {
  for (const group of groups(findings)) {
    const first = group[0]
    const title = group.length === 1 ? first.title : `${first.id.replace(/-/g, ' ')} ×${group.length}`
    console.log(`  ${severityTag(first.severity)}${c.bold(title)}  ${c.dim(first.confidence + ' confidence')}`)
    for (const finding of group) {
      if (group.length > 1 && verbose) console.log(`${INDENT}${c.muted(finding.title)}`)
      const where = whereLine(finding)
      if (where) console.log(where)
      for (const line of finding.evidence ?? []) console.log(`${INDENT}${c.dim('on-chain: ' + line)}`)
    }
    if (verbose) explain(first)
    if (verbose || group.length > 1) console.log()
  }
}

function printSummary(counted: Finding[], ignored = 0): void {
  if (counted.length === 0) {
    const text = ignored > 0 ? 'No new signals since the baseline.' : `No signals from ${COVERAGE.checked.length} checks.`
    console.log(`  ${c.bold('RESULT')}  ${c.success(text)} ${c.muted('This is not a safety guarantee.')}`)
    return
  }
  const counts = (['high', 'medium', 'low'] as Severity[])
    .map(severity => [severity, counted.filter(finding => finding.severity === severity).length] as const)
    .filter(([, count]) => count > 0)
    .map(([severity, count]) => SEVERITY_COLOR[severity](`${count} ${severity}`))
    .join(c.dim(' · '))
  const top = counted[0]
  const location = findingLocation(top)
  console.log(`  ${c.bold('RESULT')}  ${counts}  ${c.dim('triage signals to verify, not confirmed bugs')}`)
  console.log(`  ${c.muted('start with')}  ${top.title}${location ? c.dim(`  (${location})`) : ''}`)
}

function printCoverage(scan: SecurityScan): void {
  if (scan.findings.some(finding => finding.id === 'no-source')) {
    console.log(`  ${c.warn('⚠ Source not verified: only on-chain checks ran. A clean result here means little.')}`)
  }
  console.log(`  ${c.dim('not checked: ' + COVERAGE.notChecked.join(', '))}`)
}

export interface SecurityOptions {
  format?: 'text' | 'json' | 'sarif' | 'markdown'
  failOn?: Severity
  verbose?: boolean
  baseline?: string  // JSON file of reviewed findings to hide
  updateBaseline?: boolean  // add the current findings to the baseline file
}

export async function runSecurity(
  rawAddress: string,
  chainName: string,
  config: Config,
  rpcOverride?: string,
  options: SecurityOptions = {}
): Promise<void> {
  const { format = 'text', failOn, verbose = false } = options
  const spinner = format !== 'text' ? null : ora({ text: `  Scanning security surface for ${shortAddr(rawAddress)}...`, spinner: 'arc' }).start()

  try {
    const fullScan = await scanSecurity(rawAddress, chainName, config, rpcOverride)
    spinner?.stop()
    let scan = fullScan
    let ignored = 0
    if (options.baseline) {
      const baseline = loadBaseline(options.baseline)
      if (options.updateBaseline) {
        const added = updateBaseline(options.baseline, fullScan, baseline)
        console.error(`unffold: added ${added} finding(s) to ${options.baseline}; edit each "reason" to record why it is accepted`)
      }
      ;({ scan, ignored } = applyBaseline(fullScan, loadBaseline(options.baseline)))
    }
    const failing = failOn ? scan.findings.filter(finding => atLeast(finding.severity, failOn)) : []
    if (failing.length > 0) {
      // CI gate: exit non-zero, but still print the report below
      process.exitCode = 1
      console.error(`unffold: ${failing.length} finding(s) at or above --fail-on ${failOn}`)
    }

    if (format === 'markdown') {
      console.log(toMarkdown(scan, ignored))
      return
    }
    if (format !== 'text') {
      console.log(JSON.stringify(format === 'sarif' ? toSarif(scan) : { ...scan, coverage: COVERAGE, ignoredByBaseline: ignored }, null, 2))
      return
    }

    const explorer = scan.chain.explorerUrl
    const link = (addr: string) => c.address(addressLink(shortAddr(addr), addr, explorer))
    const counted = scan.findings.filter(finding => finding.severity !== 'info')
    const info = scan.findings.filter(finding => finding.severity === 'info')

    console.log()
    console.log(`  ${c.bold('SECURITY SURFACE')}  ${link(scan.address)}  ${c.muted('[' + chainName + ']')}`)
    console.log(c.dim('  ──────────────────────────────────────────────────'))
    const known = knownBadge(scan.chain.chainId, scan.address)
    if (known) console.log(`  ${c.muted('known'.padEnd(10))}${c.success(known)}`)
    if (scan.proxy) {
      console.log(`  ${c.muted('proxy'.padEnd(10))}${scan.proxy.pattern}${scan.proxy.adminAddress ? `  admin ${link(scan.proxy.adminAddress)}` : ''}`)
      console.log(`  ${c.muted('analyzed'.padEnd(10))}${scan.target.name}  ${link(scan.target.address)}  ${c.dim('(implementation)')}`)
    }
    console.log(`  ${c.muted('as of'.padEnd(10))}block ${scan.block}  ${c.dim(scan.scannedAt.replace('T', ' ').slice(0, 16) + ' UTC')}${scan.proxy ? c.dim('  · reflects the current implementation; an upgrade can change it') : ''}`)
    for (const path of scan.control) {
      const color = path.singleKeyNoDelay ? c.warn : (text: string) => text
      console.log(`  ${c.muted((path.role === 'upgrades' ? 'upgrades' : 'owner').padEnd(10))}${color(path.summary)}`)
    }
    console.log(`  ${c.muted('source'.padEnd(10))}${scan.target.verified ? c.success('verified') : c.warn('unverified')}  ${c.dim(`${scan.stats.stateChanging} state-changing fns, ${scan.stats.privilegedLooking} privileged-looking`)}`)
    console.log()

    printSummary(counted, ignored)
    console.log()
    printFindings(counted, verbose)
    if (info.length > 0) {
      console.log()
      for (const finding of info) console.log(`  ${severityTag('info')}${c.muted(finding.title)}`)
    }
    if (ignored > 0) console.log(`\n  ${c.dim(`${ignored} finding(s) hidden by baseline ${options.baseline}`)}`)
    console.log()
    printCoverage(scan)
    if (!verbose && counted.length > 0) console.log(`  ${c.dim('add --verbose for why each finding matters, how to verify it, and when it is a false positive')}`)
    console.log()
  } catch (err) {
    spinner?.fail()
    throw err
  }
}
