import { describe, expect, it } from 'vitest'
import { getAddress, type PublicClient } from 'viem'
import { formatDelay, resolveControl } from '../core/control.js'
import { getUpgradeHistory } from '../core/proxy-detector.js'

// Fake chain: address -> bytecode + view function results
type Fake = Record<string, { code?: string; views?: Record<string, unknown> }>

function fakeClient(chain: Fake): PublicClient {
  return {
    getCode: async ({ address }: { address: string }) => chain[address]?.code ?? '0x',
    readContract: async ({ address, functionName }: { address: string; functionName: string }) => {
      const value = chain[address]?.views?.[functionName]
      if (value === undefined) throw new Error('revert')
      return value
    },
  } as unknown as PublicClient
}

const A = '0x00000000000000000000000000000000000000a1'
const B = '0x00000000000000000000000000000000000000b2'
const C = '0x00000000000000000000000000000000000000c3'

describe('who controls', () => {
  it('follows ProxyAdmin → owner and flags a single key with no delay', async () => {
    const path = await resolveControl(fakeClient({ [A]: { code: '0x60', views: { owner: B } } }), 'upgrades', A)
    expect(path.hops.map(hop => hop.kind)).toEqual(['owned', 'eoa'])
    expect(path.singleKeyNoDelay).toBe(true)
    expect(path.summary).toBe('contract with an owner → single key (EOA) · no delay')
  })

  it('stops at a Safe and reports threshold and modules', async () => {
    const chain = { [A]: { code: '0x60', views: { getThreshold: 3n, getOwners: [B, C, A, A, A], getModulesPaginated: [[C], A] } } }
    const path = await resolveControl(fakeClient(chain), 'upgrades', A)
    expect(path.hops[0].detail).toBe('Safe 3/5, 1 module(s) can act without signers')
    expect(path.singleKeyNoDelay).toBe(false)
  })

  it('adds up timelock delays along the path', async () => {
    const chain = {
      [A]: { code: '0x60', views: { delay: 172800n, admin: B } },
      [B]: { code: '0x60', views: { owner: C } },
    }
    const path = await resolveControl(fakeClient(chain), 'upgrades', A)
    expect(path.totalDelaySeconds).toBe(172800)
    expect(path.singleKeyNoDelay).toBe(false)
    expect(path.summary).toContain('total delay 2d')
  })

  it('recognizes EIP-7702 delegated EOAs and renounced ownership', async () => {
    const delegated = await resolveControl(fakeClient({ [A]: { code: '0xef0100' + 'ab'.repeat(20) } }), 'owner', A)
    expect(delegated.hops[0].kind).toBe('eoa')
    const renounced = await resolveControl(fakeClient({}), 'owner', '0x0000000000000000000000000000000000000000')
    expect(renounced.hops[0].kind).toBe('renounced')
    expect(renounced.singleKeyNoDelay).toBe(false)
  })

  it('formats delays', () => {
    expect([formatDelay(45), formatDelay(600), formatDelay(7200), formatDelay(172800)]).toEqual(['45s', '10m', '2h', '2d'])
  })
})

describe('delay wording', () => {
  it('does not claim "no delay" for DAOs or unrecognized contracts', async () => {
    const dao = await resolveControl(fakeClient({ [A]: { code: '0x60', views: { acl: B } } }), 'upgrades', A)
    expect(dao.summary).toContain('delay set by governance votes')
    const unknown = await resolveControl(fakeClient({ [A]: { code: '0x60' } }), 'upgrades', A)
    expect(unknown.summary).toContain('delay unknown')
  })
})

describe('upgrade history', () => {
  it('decodes indexed (EIP-1967) and non-indexed (ZeppelinOS) Upgraded logs, and reports unavailable as null', async () => {
    const pad = (address: string) => '0x' + address.slice(2).padStart(64, '0')
    const logs = [
      { topics: ['0xbc7c', pad(B)], data: '0x', blockNumber: '0x10' },
      { topics: ['0xbc7c'], data: pad(C), blockNumber: '0x20' },
    ]
    const ok = { request: async () => logs } as unknown as PublicClient
    expect(await getUpgradeHistory(A, ok)).toEqual([
      { address: getAddress(B), blockNumber: 16n },
      { address: getAddress(C), blockNumber: 32n },
    ])
    const limited = { request: async () => { throw new Error('range too large') } } as unknown as PublicClient
    expect(await getUpgradeHistory(A, limited)).toBeNull()
  })
})
