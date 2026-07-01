import { describe, expect, it } from 'vitest'
import { buildProfileReport } from '../core/profile-report.js'
import type { RiskSummary } from '../core/risk-summary.js'
import type { ChainConfig } from '../types.js'

const CHAIN: ChainConfig = {
  name: 'Ethereum mainnet',
  chainId: 1,
  explorerApiUrl: 'https://api.etherscan.io/api',
  explorerUrl: 'https://etherscan.io/address/',
  rpcUrl: 'https://example.invalid',
}

const SUMMARY: RiskSummary = {
  overall: 'high',
  score: 95,
  mainReason: 'The contract can be upgraded.',
  summary: 'High risk: The contract can be upgraded.',
  badges: ['ERC-20', 'Verified', 'Upgradeable'],
  verified: true,
  proxy: {
    detected: true,
    pattern: 'Transparent proxy',
    adminAddress: '0x0000000000000000000000000000000000000001',
    implementationAddress: '0x0000000000000000000000000000000000000002',
  },
  standards: ['ERC-20'],
  controls: {
    mint: [],
    burn: [],
    pause: [],
    blacklist: [],
    tax: [],
    tradingGate: [],
  },
  signals: [
    {
      id: 'upgradeable',
      label: 'Upgradeable contract',
      severity: 'high',
      detail: 'Transparent proxy',
      meaning: 'The contract is upgradeable.',
      whyItMatters: 'Logic can change.',
      recommendation: 'Check who controls upgrades.',
    },
    {
      id: 'verified-source',
      label: 'Source verified',
      severity: 'ok',
      detail: 'Verified source was available.',
      meaning: 'Source is verified.',
      whyItMatters: 'Inspection is more reliable.',
      recommendation: 'Still review other signals.',
    },
  ],
}

describe('profile report', () => {
  it('builds an extension-friendly report from risk summary and facts', () => {
    const report = buildProfileReport({
      profile: 'token',
      title: 'USD Coin',
      subtitle: 'USDC · Ethereum mainnet',
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      chain: CHAIN,
      riskSummary: SUMMARY,
      facts: [{ label: 'Symbol', value: 'USDC' }],
    })

    expect(report.profile).toBe('token')
    expect(report.risk.level).toBe('high')
    expect(report.badges).toContain('Upgradeable')
    expect(report.facts).toEqual([{ label: 'Symbol', value: 'USDC' }])
    expect(report.warnings).toEqual([
      {
        id: 'upgradeable',
        title: 'Upgradeable contract',
        severity: 'high',
        body: 'Logic can change.',
        recommendation: 'Check who controls upgrades.',
      },
    ])
    expect(report.links[0]).toEqual({
      label: 'Explorer',
      url: 'https://etherscan.io/address/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    })
  })
})
