import { createPublicClient, http, type PublicClient } from 'viem'
import {
  mainnet,
  arbitrum,
  base,
  optimism,
  polygon,
  zkSync,
  sepolia,
  holesky,
} from 'viem/chains'
import type { ChainConfig, Config } from '../types.js'

export const CHAINS: Record<string, ChainConfig> = {
  mainnet: {
    name: 'Ethereum mainnet',
    chainId: 1,
    explorerApiUrl: 'https://api.etherscan.io/api',
    rpcUrl: 'https://ethereum-rpc.publicnode.com',
  },
  arbitrum: {
    name: 'Arbitrum One',
    chainId: 42161,
    explorerApiUrl: 'https://api.arbiscan.io/api',
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
  },
  base: {
    name: 'Base',
    chainId: 8453,
    explorerApiUrl: 'https://api.basescan.org/api',
    rpcUrl: 'https://mainnet.base.org',
  },
  optimism: {
    name: 'Optimism',
    chainId: 10,
    explorerApiUrl: 'https://api-optimistic.etherscan.io/api',
    rpcUrl: 'https://mainnet.optimism.io',
  },
  polygon: {
    name: 'Polygon',
    chainId: 137,
    explorerApiUrl: 'https://api.polygonscan.com/api',
    rpcUrl: 'https://polygon-bor-rpc.publicnode.com',
  },
  zksync: {
    name: 'zkSync Era',
    chainId: 324,
    explorerApiUrl: 'https://block-explorer-api.mainnet.zksync.io/api',
    rpcUrl: 'https://mainnet.era.zksync.io',
  },
  sepolia: {
    name: 'Sepolia testnet',
    chainId: 11155111,
    explorerApiUrl: 'https://api-sepolia.etherscan.io/api',
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
  },
  holesky: {
    name: 'Holesky testnet',
    chainId: 17000,
    explorerApiUrl: 'https://api-holesky.etherscan.io/api',
    rpcUrl: 'https://ethereum-holesky-rpc.publicnode.com',
  },
}

const VIEM_CHAINS: Record<number, typeof mainnet> = {
  1: mainnet,
  42161: arbitrum as unknown as typeof mainnet,
  8453: base as unknown as typeof mainnet,
  10: optimism as unknown as typeof mainnet,
  137: polygon as unknown as typeof mainnet,
  324: zkSync as unknown as typeof mainnet,
  11155111: sepolia as unknown as typeof mainnet,
  17000: holesky as unknown as typeof mainnet,
}

export function createClient(chainName: string, config: Config, rpcOverride?: string): PublicClient {
  const chain = CHAINS[chainName]
  if (!chain) {
    throw new Error(`Unsupported chain: ${chainName}. Supported: ${Object.keys(CHAINS).join(', ')}`)
  }

  const rpcUrl = rpcOverride ?? config.rpcOverrides?.[chainName] ?? chain.rpcUrl
  const viemChain = VIEM_CHAINS[chain.chainId]

  return createPublicClient({
    chain: viemChain,
    transport: http(rpcUrl),
  })
}

export function getChainConfig(chainName: string): ChainConfig {
  const chain = CHAINS[chainName]
  if (!chain) {
    throw new Error(`Unsupported chain: ${chainName}. Supported: ${Object.keys(CHAINS).join(', ')}`)
  }
  return chain
}
