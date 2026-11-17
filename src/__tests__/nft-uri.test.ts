import { describe, expect, it } from 'vitest'
import { normalizeNftUri } from '../core/profiles/nft-profile.js'

describe('normalizeNftUri', () => {
  it('routes ipfs:// and ipfs.io URLs to a gateway that still serves plain fetches', () => {
    expect(normalizeNftUri('ipfs://QmA/1')).toBe('https://gateway.pinata.cloud/ipfs/QmA/1')
    expect(normalizeNftUri('ipfs://ipfs/QmA')).toBe('https://gateway.pinata.cloud/ipfs/QmA')
    expect(normalizeNftUri('https://ipfs.io/ipfs/QmA')).toBe('https://gateway.pinata.cloud/ipfs/QmA')
    expect(normalizeNftUri('ar://abc')).toBe('https://arweave.net/abc')
    expect(normalizeNftUri('https://example.com/1.json')).toBe('https://example.com/1.json')
  })
})
