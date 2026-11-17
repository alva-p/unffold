import { COVERAGE, docsUrl, scanSecurity, type Finding } from './security-checks.js'
import type { ProfileReport, ProfileWarning } from './profile-report.js'
import type { Config } from '../types.js'

export function findingLocation(finding: Finding): string {
  if (!finding.file) return ''
  return finding.line ? `${finding.file}:${finding.line}` : finding.file
}

function toWarning(finding: Finding): ProfileWarning {
  return {
    id: finding.id,
    title: finding.title,
    severity: finding.severity,
    confidence: finding.confidence,
    body: finding.detail,
    recommendation: finding.recommendation,
    falsePositive: finding.falsePositives,
    evidence: finding.evidence,
    location: findingLocation(finding) || undefined,
    docsUrl: docsUrl(finding.id),
  }
}

export async function buildSecurityReport(
  rawAddress: string,
  chainName: string,
  config: Config,
  rpcOverride?: string
): Promise<ProfileReport> {
  const scan = await scanSecurity(rawAddress, chainName, config, rpcOverride)
  const warnings = scan.findings.filter(finding => finding.severity !== 'info').map(toWarning)
  // A high-severity heuristic alone should not paint a contract "High risk" for non-experts.
  const high = warnings.some(item => item.severity === 'high' && item.confidence === 'high')
  const medium = warnings.some(item => item.severity === 'high' || item.severity === 'medium')
  const level = high ? 'high' : medium ? 'medium' : 'low'
  const noSource = scan.findings.some(finding => finding.id === 'no-source')
  const clean = noSource
    ? 'Source not verified: only on-chain checks ran, so this result says little.'
    : `No signals from ${COVERAGE.checked.length} checks. Not a safety guarantee: ${COVERAGE.notChecked.join(', ')} are not checked.`

  return {
    profile: 'security',
    title: scan.target.name,
    subtitle: `${scan.chain.name} · security surface`,
    address: scan.address,
    chain: { name: scan.chain.name, id: scan.chain.chainId },
    badges: [
      scan.target.verified ? 'Verified' : 'Unverified',
      ...(scan.proxy ? ['Upgradeable'] : []),
    ],
    risk: {
      level,
      score: high ? 90 : medium ? 45 : 0,
      summary: high
        ? 'High risk: a high-confidence, high-severity signal needs manual verification.'
        : medium
          ? 'Review needed: signals found that a human should verify.'
          : clean,
      mainReason: warnings[0] ? `${warnings[0].title}. ${warnings[0].body}` : clean,
    },
    facts: [
      { label: 'Source', value: scan.target.verified ? 'verified' : 'unverified' },
      { label: 'Proxy', value: scan.proxy?.pattern ?? 'not detected' },
      { label: 'Analyzed', value: scan.proxy ? `implementation ${scan.target.address}` : 'contract itself' },
      { label: 'State-changing fns', value: scan.stats.stateChanging },
      { label: 'Privileged-looking fns', value: scan.stats.privilegedLooking },
      { label: 'Findings', value: scan.findings.filter(finding => finding.severity !== 'info').length },
    ],
    warnings,
    links: [{ label: 'Explorer', url: `${scan.chain.explorerUrl}${scan.address}` }],
  }
}
