import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fingerprint, parseSources, runChecks, shortenPaths } from '../core/security-checks.js'
import { findingsFor, fixture, ids } from './security-helpers.js'
import { toSarif } from '../output/sarif.js'

describe('surface checks', () => {
  it('flags every issue in the vulnerable fixture with file:line', async () => {
    const findings = await findingsFor(fixture('surface/Vuln.sol'))
    expect(ids(findings)).toEqual(['delegatecall', 'selfdestruct', 'tx-origin', 'unprotected-initializer', 'unprotected-privileged'])
    const setFee = findings.find(finding => finding.id === 'unprotected-privileged')!
    expect(setFee.title).toContain('setFee')
    expect(setFee).toMatchObject({ file: 'surface/Vuln.sol', line: 16 })
  })

  it('stays quiet on the safe fixture', async () => {
    expect(await findingsFor(fixture('surface/Safe.sol'))).toEqual([])
  })

  it('ignores vendored code by path and by flattened header', async () => {
    const library = 'library Address { function f(address t, bytes memory d) internal { t.delegatecall(d); } }'
    expect(await findingsFor({ '@openzeppelin/contracts/utils/Address.sol': library })).toEqual([])
    expect(await findingsFor({ 'lib/openzeppelin-contracts/Address.sol': library })).toEqual([])
    const flattened = `pragma solidity ^0.8.0;
// OpenZeppelin Contracts (last updated v5.0.0) (utils/Address.sol)
${library}
contract Mine { function setFee(uint256) external {} }`
    const findings = await findingsFor({ 'Mine.sol': flattened })
    expect(ids(findings)).toEqual(['unprotected-privileged'])
  })

  it('skips interfaces and reports missing source', async () => {
    expect(await findingsFor({ 'I.sol': 'interface I { function setFee(uint256) external; }' })).toEqual([])
    expect(ids(await findingsFor({}))).toEqual(['no-source'])
  })

  it('reports proxies as upgradeable', async () => {
    const findings = await runChecks({
      sources: {},
      proxy: { pattern: 'UUPS (EIP-1822)', implementationAddress: '0x0000000000000000000000000000000000000001', depth: 0 },
    })
    expect(ids(findings)).toEqual(['no-source', 'upgradeable'])
  })

  it('records files that fail to parse', () => {
    expect(parseSources({ 'Bad.sol': 'contract { ' }).failed).toEqual(['Bad.sol'])
  })
})

describe('uups-unprotected-upgrade', () => {
  it('flags empty and caller-less _authorizeUpgrade', async () => {
    const findings = await findingsFor(fixture('uups-auth/Vuln.sol'))
    expect(findings.map(finding => [finding.id, finding.severity, finding.confidence, finding.line])).toEqual([
      ['uups-unprotected-upgrade', 'high', 'high', 14],
      ['uups-unprotected-upgrade', 'medium', 'low', 19],
    ])
  })

  it('accepts modifier, helper and msg.sender checks', async () => {
    expect(await findingsFor(fixture('uups-auth/Safe.sol'))).toEqual([])
  })
})

describe('initializer state (static, no chain)', () => {
  it('flags an initializable implementation that never disables initializers', async () => {
    const findings = await findingsFor(fixture('init-state/Vuln.sol', 'init-state/Initializable.sol'))
    expect(findings.map(finding => [finding.id, finding.severity, finding.confidence])).toEqual([
      ['initializers-not-disabled', 'medium', 'medium'],
    ])
  })

  it('accepts _disableInitializers() in the constructor', async () => {
    expect(await findingsFor(fixture('init-state/Safe.sol', 'init-state/Initializable.sol'))).toEqual([])
  })
})

describe('unchecked-low-level-call', () => {
  it('flags discarded, dropped and unread success flags', async () => {
    const findings = await findingsFor(fixture('unchecked-call/Vuln.sol'))
    expect(findings.map(finding => [finding.id, finding.line])).toEqual([
      ['unchecked-low-level-call', 8],
      ['unchecked-low-level-call', 12],
      ['unchecked-low-level-call', 16],
      ['unchecked-low-level-call', 20],
    ])
  })

  it('accepts require, revert, return and assignment-form checks', async () => {
    expect(await findingsFor(fixture('unchecked-call/Safe.sol'))).toEqual([])
  })
})

describe('oracle staleness', () => {
  it('flags dropped/unchecked updatedAt, unchecked answer and latestAnswer()', async () => {
    const findings = await findingsFor(fixture('oracle/Vuln.sol'))
    expect(findings.map(finding => [finding.id, finding.severity, finding.confidence, finding.line])).toEqual([
      ['oracle-stale-price', 'medium', 'high', 16],
      ['oracle-stale-price', 'medium', 'medium', 22],
      ['oracle-answer-unchecked', 'low', 'medium', 16],
      ['oracle-latest-answer', 'info', 'high', 30],
    ])
  })

  it('accepts inline checks, helper validation and pass-through wrappers', async () => {
    expect(await findingsFor(fixture('oracle/Safe.sol'))).toEqual([])
  })

  it('flags missing sequencer check only on L2s', async () => {
    const run = (chainName: string) => runChecks({ sources: fixture('oracle/Safe.sol'), proxy: null, chainName })
    expect(ids(await run('arbitrum'))).toEqual(['oracle-no-sequencer-check'])
    expect(await run('mainnet')).toEqual([])
  })
})

describe('sarif', () => {
  it('emits one rule per finding id and a location for every result', async () => {
    const findings = await findingsFor(fixture('surface/Vuln.sol'))
    findings.push({ ...findings[0], id: 'upgradeable', file: undefined, line: undefined })
    const sarif = toSarif({
      address: '0x0000000000000000000000000000000000000001',
      chain: { name: 'Anvil (local)', chainId: 31337, explorerApiUrl: '', explorerUrl: '', rpcUrl: '' },
      contract: { name: 'Proxy', verified: true },
      target: { address: '0x0000000000000000000000000000000000000002', name: 'SurfaceVuln', verified: true, file: 'surface/Vuln.sol' },
      proxy: null,
      stats: { stateChanging: 0, privilegedLooking: 0 },
      block: '123',
      scannedAt: '2026-11-17T00:00:00.000Z',
      control: [],
      findings,
    })
    const run = sarif.runs[0]
    expect(sarif.version).toBe('2.1.0')
    expect(run.tool.driver.rules.map(rule => rule.id).sort()).toEqual([...new Set(findings.map(f => f.id))].sort())
    expect(run.results).toHaveLength(findings.length)
    for (const result of run.results) expect(result.locations[0].physicalLocation.artifactLocation.uri).toBe('surface/Vuln.sol')
    const initializer = run.results.find(result => result.ruleId === 'unprotected-initializer')!
    expect(initializer.level).toBe('error')
    expect(initializer.locations[0].physicalLocation.region).toEqual({ startLine: 11 })
    expect(run.tool.driver.rules[0].helpUri).toMatch(/docs\/detectors\.md#/)
    const prints = run.results.map(result => result.partialFingerprints['unffoldFinding/v1'])
    expect(new Set(prints).size).toBe(prints.length)
  })

  it('keeps fingerprints stable when a finding moves to another line', async () => {
    const [finding] = (await findingsFor(fixture('surface/Vuln.sol'))).filter(f => f.id === 'unprotected-privileged')
    expect(fingerprint({ ...finding, line: 99 }, 1, '0xAB')).toBe(fingerprint(finding, 1, '0xab'))
  })
})

describe('presentation helpers', () => {
  it('attaches the offending source line to each finding', async () => {
    const findings = await findingsFor(fixture('surface/Vuln.sol'))
    expect(findings.find(finding => finding.id === 'unprotected-privileged')?.code).toBe('function setFee(uint256 newFee) external {')
  })

  it('strips the deployer machine prefix from absolute source paths', () => {
    const short = shortenPaths({
      '/Users/dev/repo/contracts/Token.sol': '',
      '/Users/dev/repo/node_modules/@openzeppelin/Ownable.sol': '',
      'src/Other.sol': '',
    })
    expect(Object.keys(short)).toEqual(['contracts/Token.sol', 'node_modules/@openzeppelin/Ownable.sol', 'src/Other.sol'])
  })
})

describe('detector docs', () => {
  it('documents every finding id in docs/detectors.md', () => {
    const root = join(__dirname, '../..')
    const source = readFileSync(join(root, 'src/core/security-checks.ts'), 'utf8')
    const docs = readFileSync(join(root, 'docs/detectors.md'), 'utf8')
    const ids = [...new Set([...source.matchAll(/id: '([a-z-]+)'/g)].map(match => match[1]))]
    expect(ids.length).toBeGreaterThan(10)
    expect(ids.filter(id => !docs.includes(`### ${id}\n`))).toEqual([])
  })
})
