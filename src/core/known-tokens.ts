// Official addresses of regulated issuer tokens whose admin powers (freeze, pause, upgrade, mint)
// are expected, not a scam signal. Every entry was checked on-chain (symbol() / name()).
// ponytail: tiny hand-kept list; extend only with addresses verified against the issuer's own docs.

export interface KnownToken {
  symbol: string
  issuer: string
  powers: string
}

const CIRCLE = 'Circle'
const STABLE_POWERS = 'freeze addresses, pause transfers, mint and upgrade the contract'

const KNOWN: Record<number, Record<string, KnownToken>> = {
  1: {
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { symbol: 'USDC', issuer: CIRCLE, powers: STABLE_POWERS },
    '0x1abaea1f7c830bd89acc67ec4af516284b1bc33c': { symbol: 'EURC', issuer: CIRCLE, powers: STABLE_POWERS },
    '0xdac17f958d2ee523a2206206994597c13d831ec7': { symbol: 'USDT', issuer: 'Tether', powers: 'freeze addresses, pause transfers and mint' },
    '0x6c3ea9036406852006290770bedfcaba0e23a0e8': { symbol: 'PYUSD', issuer: 'Paxos', powers: STABLE_POWERS },
  },
  8453: { '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { symbol: 'USDC', issuer: CIRCLE, powers: STABLE_POWERS } },
  42161: { '0xaf88d065e77c8cc2239327c5edb3a432268e5831': { symbol: 'USDC', issuer: CIRCLE, powers: STABLE_POWERS } },
  10: { '0x0b2c639c533813f4aa9d7837caf62653d097ff85': { symbol: 'USDC', issuer: CIRCLE, powers: STABLE_POWERS } },
  137: {
    '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': { symbol: 'USDC', issuer: CIRCLE, powers: STABLE_POWERS },
    '0xc2132d05d31c914a87c6611c10748aeb04b58e8f': { symbol: 'USDT0', issuer: 'Tether', powers: STABLE_POWERS },
  },
}

export function knownToken(chainId: number, address: string): KnownToken | null {
  return KNOWN[chainId]?.[address.toLowerCase()] ?? null
}

// A token reusing a known symbol at another address on the same chain. Only chains where we know
// the official address are checked, so legitimate deployments elsewhere are never flagged.
export function impersonatedToken(chainId: number, address: string, symbol: string | null | undefined): { official: string; token: KnownToken } | null {
  if (!symbol) return null
  const wanted = symbol.trim().toUpperCase()
  for (const [official, token] of Object.entries(KNOWN[chainId] ?? {})) {
    if (token.symbol === wanted && official !== address.toLowerCase()) return { official, token }
  }
  return null
}
