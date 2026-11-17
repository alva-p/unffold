// Well-known tokens and contracts, so users get "this is the official one" instead of generic warnings,
// and tokens copying a known symbol are flagged. Every address was checked on-chain (symbol() / code)
// on 2026-11-17. ponytail: hand-kept list; extend only with addresses verified against the project's docs.

export type TokenKind = 'issuer' | 'canonical' | 'bridged'

export interface KnownToken {
  symbol: string
  kind: TokenKind
  by: string  // issuer, project, or bridge
  powers?: string  // issuer tokens only: admin powers expected from a regulated issuer
}

const CIRCLE = 'Circle'
const STABLE_POWERS = 'freeze addresses, pause transfers, mint and upgrade the contract'
const issuer = (symbol: string, by: string, powers = STABLE_POWERS): KnownToken => ({ symbol, kind: 'issuer', by, powers })
const canonical = (symbol: string, by: string): KnownToken => ({ symbol, kind: 'canonical', by })
const bridged = (symbol: string, by: string): KnownToken => ({ symbol, kind: 'bridged', by })

const WETH_L2 = canonical('WETH', 'canonical wrapped ether')

const KNOWN: Record<number, Record<string, KnownToken>> = {
  1: {
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': issuer('USDC', CIRCLE),
    '0x1abaea1f7c830bd89acc67ec4af516284b1bc33c': issuer('EURC', CIRCLE),
    '0xdac17f958d2ee523a2206206994597c13d831ec7': issuer('USDT', 'Tether', 'freeze addresses, pause transfers and mint'),
    '0x6c3ea9036406852006290770bedfcaba0e23a0e8': issuer('PYUSD', 'Paxos'),
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': canonical('WETH', 'canonical wrapped ether'),
    '0x6b175474e89094c44da98b954eedeac495271d0f': canonical('DAI', 'MakerDAO / Sky'),
    '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': canonical('WBTC', 'BitGo'),
    '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0': canonical('wstETH', 'Lido'),
    '0xae7ab96520de3a18e5e111b5eaab095312d7fe84': canonical('stETH', 'Lido'),
    '0x4c9edd5852cd905f086c759e8383e09bff1e68b3': canonical('USDe', 'Ethena'),
    '0x514910771af9ca656af840dff83e8264ecf986ca': canonical('LINK', 'Chainlink'),
    '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': canonical('UNI', 'Uniswap'),
  },
  8453: {
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': issuer('USDC', CIRCLE),
    '0x4200000000000000000000000000000000000006': WETH_L2,
    '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca': bridged('USDbC', 'Base bridge'),
    '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': bridged('DAI', 'Base bridge'),
    '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2': bridged('USDT', 'Base bridge'),
  },
  42161: {
    '0xaf88d065e77c8cc2239327c5edb3a432268e5831': issuer('USDC', CIRCLE),
    '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': WETH_L2,
    '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8': bridged('USDC', 'Arbitrum bridge (USDC.e)'),
    '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1': bridged('DAI', 'Arbitrum bridge'),
    '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f': bridged('WBTC', 'Arbitrum bridge'),
  },
  10: {
    '0x0b2c639c533813f4aa9d7837caf62653d097ff85': issuer('USDC', CIRCLE),
    '0x4200000000000000000000000000000000000006': WETH_L2,
    '0x7f5c764cbc14f9669b88837ca1490cca17c31607': bridged('USDC', 'Optimism bridge (USDC.e)'),
    '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1': bridged('DAI', 'Optimism bridge'),
    '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58': bridged('USDT', 'Optimism bridge'),
  },
  137: {
    '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': issuer('USDC', CIRCLE),
    '0xc2132d05d31c914a87c6611c10748aeb04b58e8f': issuer('USDT0', 'Tether'),
    '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619': bridged('WETH', 'Polygon PoS bridge'),
    '0x2791bca1f2de4661ed88a30c99a7a9449aa84174': bridged('USDC', 'Polygon PoS bridge (USDC.e)'),
    '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063': bridged('DAI', 'Polygon PoS bridge'),
  },
}

export function knownToken(chainId: number, address: string): KnownToken | null {
  return KNOWN[chainId]?.[address.toLowerCase()] ?? null
}

// A token reusing a known symbol at another address on the same chain. Only chains where we know
// the official addresses are checked, so legitimate deployments elsewhere are never flagged.
export function impersonatedToken(chainId: number, address: string, symbol: string | null | undefined): { official: string; token: KnownToken } | null {
  if (!symbol || knownToken(chainId, address)) return null
  const wanted = symbol.trim().toLowerCase()
  const match = Object.entries(KNOWN[chainId] ?? {})
    .filter(([, token]) => token.symbol.toLowerCase() === wanted)
    .sort(([, a], [, b]) => Number(a.kind === 'bridged') - Number(b.kind === 'bridged'))[0]
  return match ? { official: match[0], token: match[1] } : null
}

// Infrastructure people paste often. Same address on several chains only for CREATE2/deterministic
// deployments documented by the project (and confirmed to have code on each chain).
const L1_L2 = [1, 10, 137, 8453, 42161]
const CONTRACTS: Array<{ name: string; address: string; chains: number[] }> = [
  { name: 'Uniswap Permit2', address: '0x000000000022d473030f116ddee9f6b43ac78ba3', chains: L1_L2 },
  { name: 'Uniswap V2 Router', address: '0x7a250d5630b4cf539739df2c5dacb4c659f2488d', chains: [1] },
  { name: 'Uniswap V3 SwapRouter', address: '0xe592427a0aece92de3edee1f18e0157c05861564', chains: [1, 10, 137, 42161] },
  { name: 'Uniswap SwapRouter02', address: '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45', chains: [1, 10, 137, 42161] },
  { name: 'Uniswap SwapRouter02', address: '0x2626664c2603336e57b271c5c0b26f421741e481', chains: [8453] },
  { name: '1inch Aggregation Router v6', address: '0x111111125421ca6dc452d289314280a0f8842a65', chains: L1_L2 },
  { name: '1inch Aggregation Router v5', address: '0x1111111254eeb25477b68fb85ed929f73a960582', chains: L1_L2 },
  { name: 'OpenSea Seaport 1.5', address: '0x00000000000000adc04c56bf30ac9d3c0aaf14dc', chains: L1_L2 },
  { name: 'OpenSea Seaport 1.6', address: '0x0000000000000068f116a894984e2db1123eb395', chains: L1_L2 },
  { name: 'CoW Protocol Settlement', address: '0x9008d19f58aabd9ed0d60971565aa8510560ab41', chains: L1_L2 },
  { name: '0x Exchange Proxy (legacy)', address: '0xdef1c0ded9bec7f1a1670819833240f027b25eff', chains: [1, 137, 8453, 42161] },
  { name: 'Aave V3 Pool', address: '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2', chains: [1] },
]

export function knownContract(chainId: number, address: string): string | null {
  const lower = address.toLowerCase()
  return CONTRACTS.find(entry => entry.address === lower && entry.chains.includes(chainId))?.name ?? null
}

// One badge for anything recognized: "Known: Uniswap Permit2", "Official: Lido", "Bridged: Polygon PoS bridge (USDC.e)".
export function knownBadge(chainId: number, address: string): string | null {
  const contract = knownContract(chainId, address)
  if (contract) return `Known: ${contract}`
  const token = knownToken(chainId, address)
  if (!token) return null
  return token.kind === 'issuer' ? `Known issuer: ${token.by}` : token.kind === 'bridged' ? `Bridged: ${token.by}` : `Official: ${token.by}`
}
