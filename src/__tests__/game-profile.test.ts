import { describe, expect, it } from 'vitest'
import { detectGameControls, gameControlsLine, isGameLike } from '../core/profiles/game-profile.js'
import type { AbiItem } from '../types.js'

const ABI: AbiItem[] = [
  { type: 'function', name: 'grantRole' },
  { type: 'function', name: 'pauseGame' },
  { type: 'function', name: 'mintItem' },
  { type: 'function', name: 'startQuest' },
  { type: 'function', name: 'claimReward' },
]

describe('game profile heuristics', () => {
  it('groups game controls from ABI names', () => {
    const controls = detectGameControls(ABI)

    expect(controls.roles).toEqual(['grantRole'])
    expect(controls.pause).toEqual(['pauseGame'])
    expect(controls.mintBurn).toEqual(['mintItem'])
    expect(controls.gameplay).toEqual(['startQuest'])
    expect(controls.economy).toEqual(['claimReward'])
    expect(gameControlsLine(controls)).toBe('roles, pause, mintBurn, economy, gameplay')
  })

  it('detects likely game contracts without marking plain tokens', () => {
    expect(isGameLike(ABI)).toBe(true)
    expect(isGameLike([{ type: 'function', name: 'transfer' }])).toBe(false)
  })
})
