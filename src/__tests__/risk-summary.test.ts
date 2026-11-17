import { knownBadge } from '../core/known-tokens.js'
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

  it('marks unverified contracts as review needed, not high risk', () => {
    const summary = buildRiskSummary(contract({ isVerified: false }), null, BASE_STANDARDS)

    expect(summary.overall).toBe('medium')
    expect(summary.summary).toContain('Review needed')
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

describe('capability vs current state', () => {
  const owned = { ...BASE_STANDARDS, ownable: true }

  it('downgrades owner-only controls when ownership is renounced', () => {
    const summary = buildRiskSummary(contract({ abi: [fn('mint'), fn('blacklist')] }), null, owned, { owner: '0x0000000000000000000000000000000000000000' })
    const mint = summary.signals.find(signal => signal.id === 'mint-controls')!
    expect(mint.severity).toBe('info')
    expect(mint.detail).toContain('renounced')
  })

  it('separates "can pause" from "is paused now"', () => {
    const canPause = buildRiskSummary(contract({ abi: [fn('pause')] }), null, owned, { paused: false })
    expect(canPause.signals.find(signal => signal.id === 'pause-controls')).toMatchObject({ severity: 'medium', label: 'Can pause transfers' })
    const isPaused = buildRiskSummary(contract({ abi: [fn('pause')] }), null, owned, { paused: true })
    expect(isPaused.signals.find(signal => signal.id === 'pause-controls')).toMatchObject({ severity: 'high', label: 'Transfers are paused right now' })
  })
})

describe('issuer context', () => {
  const usdc = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
  const issuerAbi = [fn('mint'), fn('pause'), fn('blacklist')]
  const proxy = { pattern: 'Transparent', implementationAddress: '0x0000000000000000000000000000000000000002', adminAddress: '0x0000000000000000000000000000000000000003', depth: 0 }

  it('presents the official USDC powers as issuer controls, not high risk', () => {
    const summary = buildRiskSummary(contract({ address: usdc, abi: issuerAbi }), proxy, { ...BASE_STANDARDS, ownable: true }, { symbol: 'USDC' })
    expect(summary.overall).toBe('medium')
    expect(summary.badges).toContain('Known issuer: Circle')
    expect(summary.signals.find(signal => signal.id === 'blacklist-controls')?.severity).toBe('info')
  })

  it('flags a token copying the USDC symbol at another address', () => {
    const summary = buildRiskSummary(contract({ address: '0x00000000000000000000000000000000000000aa' }), null, BASE_STANDARDS, { symbol: 'usdc' })
    expect(summary.overall).toBe('high')
    expect(summary.signals.map(signal => signal.id)).toContain('impersonation')
  })

  it('does not flag the symbol on chains without a known official address', () => {
    const summary = buildRiskSummary(contract({ chainId: 56, address: '0x00000000000000000000000000000000000000aa' }), null, BASE_STANDARDS, { symbol: 'USDC' })
    expect(summary.signals.map(signal => signal.id)).not.toContain('impersonation')
  })
})

describe('canonical, bridged and known contracts', () => {
  it('names bridged USDC on Polygon instead of flagging it as impersonation', () => {
    const summary = buildRiskSummary(contract({ chainId: 137, address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' }), null, BASE_STANDARDS, { symbol: 'USDC' })
    const ids = summary.signals.map(signal => signal.id)
    expect(ids).not.toContain('impersonation')
    expect(ids).toContain('known-token')
    expect(summary.badges).toContain('Bridged: Polygon PoS bridge (USDC.e)')
  })

  it('marks canonical tokens as official and catches mixed-case symbol copies', () => {
    const steth = buildRiskSummary(contract({ address: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84' }), null, BASE_STANDARDS, { symbol: 'stETH' })
    expect(steth.badges).toContain('Official: Lido')
    const fake = buildRiskSummary(contract({ address: '0x00000000000000000000000000000000000000aa' }), null, BASE_STANDARDS, { symbol: 'STETH' })
    expect(fake.signals.find(signal => signal.id === 'impersonation')?.detail).toContain('0xae7ab96520de3a18e5e111b5eaab095312d7fe84')
  })

  it('recognizes infrastructure only on chains where the deployment is documented', () => {
    expect(knownBadge(8453, '0x000000000022D473030F116dDEE9F6B43aC78BA3')).toBe('Known: Uniswap Permit2')
    expect(knownBadge(1, '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D')).toBe('Known: Uniswap V2 Router')
    expect(knownBadge(42161, '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D')).toBeNull()
  })
})
