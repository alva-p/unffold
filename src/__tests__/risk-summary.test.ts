import { describe, expect, it } from 'vitest'
import { buildRiskSummary, detectTokenControls } from '../core/risk-summary.js'
import type { AbiItem, DetectedStandards, ResolvedContract } from '../types.js'

const BASE_STANDARDS: DetectedStandards = {
  erc20: true,
  erc721: false,
  erc1155: false,
  erc4626: false,
  erc2612: false,
  erc4337: false,
  ownable: false,
  ownable2Step: false,
  pausable: false,
  accessControl: false,
  reentrancyGuard: false,
}

function fn(name: string): AbiItem {
  return { type: 'function', name, inputs: [], stateMutability: 'nonpayable' }
}

function contract(overrides: Partial<ResolvedContract> = {}): ResolvedContract {
  return {
    address: '0x0000000000000000000000000000000000000001',
    chainId: 1,
    name: 'Token',
    sourceCode: '',
    abi: [],
    compilerVersion: null,
    optimizationEnabled: null,
    runs: null,
    license: null,
    isVerified: true,
    isProxy: false,
    implementationAddress: null,
    implementationName: null,
    ...overrides,
  }
}

describe('risk summary', () => {
  it('detects token control functions from ABI names', () => {
    const controls = detectTokenControls([
      fn('mint'),
      fn('setTax'),
      fn('blacklistBots'),
      fn('setMaxWallet'),
    ])

    expect(controls.mint).toEqual(['mint'])
    expect(controls.tax).toEqual(['setTax'])
    expect(controls.blacklist).toEqual(['blacklistBots'])
    expect(controls.tradingGate).toEqual(['setMaxWallet'])
  })

  it('marks unverified contracts as high risk', () => {
    const summary = buildRiskSummary(contract({ isVerified: false }), null, BASE_STANDARDS)

    expect(summary.overall).toBe('high')
    expect(summary.score).toBeGreaterThanOrEqual(70)
    expect(summary.mainReason).toContain('harder to inspect')
    expect(summary.signals.some(signal => signal.id === 'unverified-source')).toBe(true)
    expect(summary.signals[0].recommendation).toContain('verified source')
  })

  it('marks proxy admin and mint controls as high risk signals', () => {
    const summary = buildRiskSummary(
      contract({ abi: [fn('mint')] }),
      {
        pattern: 'EIP-1967 Transparent',
        implementationAddress: '0x0000000000000000000000000000000000000002',
        adminAddress: '0x0000000000000000000000000000000000000003',
        depth: 0,
      },
      { ...BASE_STANDARDS, ownable: true }
    )

    expect(summary.overall).toBe('high')
    expect(summary.summary).toContain('High risk')
    expect(summary.signals.map(signal => signal.id)).toContain('upgradeable')
    expect(summary.signals.map(signal => signal.id)).toContain('mint-controls')
  })

  it('does not treat ERC-4626 mint as an admin mint control', () => {
    const summary = buildRiskSummary(
      contract({ abi: [fn('mint')] }),
      null,
      { ...BASE_STANDARDS, erc4626: true }
    )

    expect(summary.overall).toBe('low')
    expect(summary.score).toBeLessThan(35)
    expect(summary.signals.map(signal => signal.id)).toContain('erc4626-vault')
    expect(summary.signals.map(signal => signal.id)).not.toContain('mint-controls')
  })
})
