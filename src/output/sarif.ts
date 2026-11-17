import { docsUrl, fingerprint, type Finding, type SecurityScan, type Severity } from '../core/security-checks.js'

const LEVEL: Record<Severity, 'error' | 'warning' | 'note'> = { high: 'error', medium: 'warning', low: 'note', info: 'note' }
// GitHub code scanning reads this to rank security alerts (critical >= 9, high >= 7, medium >= 4).
const SECURITY_SEVERITY: Record<Severity, string> = { high: '8.0', medium: '5.0', low: '3.0', info: '0.0' }

function result(finding: Finding, fallbackUri: string, scan: SecurityScan) {
  return {
    ruleId: finding.id,
    level: LEVEL[finding.severity],
    message: { text: `${finding.title}. ${finding.detail} Verify: ${finding.recommendation} Possible false positive: ${finding.falsePositives}` },
    locations: [{
      physicalLocation: {
        artifactLocation: { uri: (finding.file ?? fallbackUri).replace(/^\/+/, '') },
        ...(finding.line ? { region: { startLine: finding.line } } : {}),
      },
    }],
    // lets code scanning match alerts across runs and show only new ones
    partialFingerprints: { 'unffoldFinding/v1': fingerprint(finding, scan.chain.chainId, scan.target.address) },
    properties: { severity: finding.severity, confidence: finding.confidence, ...(finding.evidence ? { evidence: finding.evidence } : {}) },
  }
}

export function toSarif(scan: SecurityScan) {
  // Code scanning rejects results without a location: contract-level findings point at the file
  // declaring the analyzed contract, or at the address when no source is available.
  const fallbackUri = scan.target.file ?? scan.target.address
  const rules = new Map<string, Finding>()
  for (const finding of scan.findings) if (!rules.has(finding.id)) rules.set(finding.id, finding)

  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: {
        driver: {
          name: 'unffold',
          informationUri: 'https://github.com/alva-p/unffold',
          rules: [...rules.values()].map(finding => ({
            id: finding.id,
            shortDescription: { text: finding.id.replace(/-/g, ' ') },
            fullDescription: { text: finding.detail },
            helpUri: docsUrl(finding.id),
            help: { text: `${finding.recommendation} Possible false positive: ${finding.falsePositives}` },
            properties: { tags: ['security', 'smart-contract'], 'security-severity': SECURITY_SEVERITY[finding.severity] },
          })),
        },
      },
      results: scan.findings.map(finding => result(finding, fallbackUri, scan)),
      properties: { chainId: scan.chain.chainId, address: scan.address, implementation: scan.target.address, block: scan.block, scannedAt: scan.scannedAt },
    }],
  }
}
