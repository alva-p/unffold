import { describe, expect, it } from 'vitest'
import { chooseProfile } from '../core/analyzer.js'
import type { DetectedStandards } from '../types.js'

const BASE: DetectedStandards = {
  erc20: false,
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

describe('analyzer profile selection', () => {
  it('prefers vault over token when ERC-4626 is detected', () => {
    expect(chooseProfile({ ...BASE, erc20: true, erc4626: true }, false)).toEqual({
      profile: 'vault',
      reason: 'ERC-4626 standard detected',
    })
  })

  it('detects NFT profiles before token fallback', () => {
    expect(chooseProfile({ ...BASE, erc721: true }, false).profile).toBe('nft')
    expect(chooseProfile({ ...BASE, erc1155: true }, false).profile).toBe('nft')
  })

  it('detects ERC-20 token profile', () => {
    expect(chooseProfile({ ...BASE, erc20: true }, false)).toEqual({
      profile: 'token',
      reason: 'ERC-20 standard detected',
    })
  })

  it('falls back to proxy before generic contract', () => {
    expect(chooseProfile(BASE, true, [], null, 'Transparent proxy')).toEqual({
      profile: 'proxy',
      reason: 'Transparent proxy detected',
    })
    expect(chooseProfile(BASE, false)).toEqual({
      profile: 'contract',
      reason: 'No token, NFT, vault, game, or proxy profile matched',
    })
  })

  it('detects game-like contracts before generic proxy fallback', () => {
    expect(chooseProfile(BASE, false, [
      { type: 'function', name: 'startQuest' },
      { type: 'function', name: 'claimReward' },
    ])).toEqual({
      profile: 'game',
      reason: 'Game-like functions detected',
    })
  })
})
