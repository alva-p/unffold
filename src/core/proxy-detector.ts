import type { PublicClient } from 'viem'
import { getAddress, isAddress } from 'viem'
import type { ProxyInfo, AbiItem } from '../types.js'

const SLOTS = {
  EIP1967_IMPL: '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc' as `0x${string}`,
  EIP1967_ADMIN: '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103' as `0x${string}`,
  EIP1822_UUID: '0xc5f16f0fcc639fa48a6947836d9850f504798523bf8c9a3a87d5876cf622bcf7' as `0x${string}`,
}

const UPGRADED_TOPIC = '0xbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b' as `0x${string}`

function slotToAddress(slot: `0x${string}`): string | null {
  // Last 20 bytes of a 32-byte slot value
  const hex = slot.slice(2)
  const addrHex = '0x' + hex.slice(-40)
  if (addrHex === '0x0000000000000000000000000000000000000000') return null
  try {
    return getAddress(addrHex)
  } catch {
    return null
  }
}

function hasFunction(abi: AbiItem[] | null, name: string): boolean {
  if (!abi) return false
  return abi.some(item => item.type === 'function' && item.name === name)
}

function isMinimalProxy(bytecode: string): string | null {
  // EIP-1167: 0x363d3d373d3d3d363d73<address>5af43d82803e903d91602b57fd5bf3
  const prefix = '363d3d373d3d3d363d73'
  const idx = bytecode.indexOf(prefix)
  if (idx === -1) return null
  const addrStart = idx + prefix.length
  const addrHex = '0x' + bytecode.slice(addrStart, addrStart + 40)
  try {
    return getAddress(addrHex)
  } catch {
    return null
  }
}

export async function detectProxy(
  address: string,
  abi: AbiItem[] | null,
  client: PublicClient,
  depth = 0
): Promise<ProxyInfo | null> {
  if (depth >= 3) return null

  const addr = address as `0x${string}`

  // 1. EIP-1967 Implementation slot
  try {
    const implSlot = await client.getStorageAt({ address: addr, slot: SLOTS.EIP1967_IMPL })
    if (implSlot) {
      const implAddr = slotToAddress(implSlot)
      if (implAddr) {
        const adminSlot = await client.getStorageAt({ address: addr, slot: SLOTS.EIP1967_ADMIN })
        const adminAddr = adminSlot ? slotToAddress(adminSlot) : undefined

        // Check if UUPS (has proxiableUUID) or Transparent
        const isUUPS = hasFunction(abi, 'proxiableUUID') || await checkProxiableUUID(addr, client)
        const pattern = isUUPS ? 'UUPS (EIP-1822)' : 'Transparent (EIP-1967)'

        return {
          pattern,
          implementationAddress: implAddr,
          adminAddress: adminAddr ?? undefined,
          proxySlot: SLOTS.EIP1967_IMPL,
          depth,
        }
      }
    }
  } catch {
    // not an EIP-1967 proxy
  }

  // 2. EIP-1822 UUID slot (legacy UUPS)
  try {
    const uuidSlot = await client.getStorageAt({ address: addr, slot: SLOTS.EIP1822_UUID })
    if (uuidSlot) {
      const implAddr = slotToAddress(uuidSlot)
      if (implAddr) {
        return {
          pattern: 'UUPS (EIP-1822)',
          implementationAddress: implAddr,
          proxySlot: SLOTS.EIP1822_UUID,
          depth,
        }
      }
    }
  } catch {
    // not EIP-1822
  }

  // 3. Beacon Proxy
  if (hasFunction(abi, 'beacon')) {
    try {
      const beaconAddr = await client.readContract({
        address: addr,
        abi: [{ type: 'function', name: 'beacon', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' }],
        functionName: 'beacon',
      }) as string
      if (isAddress(beaconAddr)) {
        const implAddr = await client.readContract({
          address: beaconAddr as `0x${string}`,
          abi: [{ type: 'function', name: 'implementation', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' }],
          functionName: 'implementation',
        }) as string
        if (isAddress(implAddr)) {
          return { pattern: 'Beacon Proxy', implementationAddress: implAddr, depth }
        }
      }
    } catch {
      // not beacon
    }
  }

  // 4. Minimal Proxy EIP-1167
  try {
    const bytecode = await client.getBytecode({ address: addr })
    if (bytecode) {
      const implAddr = isMinimalProxy(bytecode.slice(2))
      if (implAddr) {
        return { pattern: 'Minimal Proxy (EIP-1167)', implementationAddress: implAddr, depth }
      }
    }
  } catch {
    // no bytecode
  }

  // 5. Diamond (EIP-2535)
  if (hasFunction(abi, 'facets')) {
    return {
      pattern: 'Diamond (EIP-2535)',
      implementationAddress: address,
      depth,
    }
  }

  // 6. OpenZeppelin legacy: admin() + implementation()
  if (hasFunction(abi, 'admin') && hasFunction(abi, 'implementation')) {
    try {
      const implAddr = await client.readContract({
        address: addr,
        abi: [{ type: 'function', name: 'implementation', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' }],
        functionName: 'implementation',
      }) as string
      if (isAddress(implAddr)) {
        return { pattern: 'Transparent (OpenZeppelin legacy)', implementationAddress: implAddr, depth }
      }
    } catch {
      // not this pattern
    }
  }

  return null
}

async function checkProxiableUUID(address: `0x${string}`, client: PublicClient): Promise<boolean> {
  try {
    await client.readContract({
      address,
      abi: [{ type: 'function', name: 'proxiableUUID', inputs: [], outputs: [{ name: '', type: 'bytes32' }], stateMutability: 'view' }],
      functionName: 'proxiableUUID',
    })
    return true
  } catch {
    return false
  }
}

export async function resolveProxyChain(
  address: string,
  abi: AbiItem[] | null,
  client: PublicClient
): Promise<ProxyInfo | null> {
  const proxy = await detectProxy(address, abi, client, 0)
  if (!proxy) return null

  // Recurse to find nested proxies
  const nested = await detectProxy(proxy.implementationAddress, null, client, proxy.depth + 1)
  if (nested) {
    proxy.chain = nested
  }

  return proxy
}

export async function getUpgradeHistory(
  address: string,
  client: PublicClient
): Promise<Array<{ address: string; blockNumber: bigint }>> {
  try {
    const logs = await client.getLogs({
      address: address as `0x${string}`,
      topics: [UPGRADED_TOPIC],
      fromBlock: 0n,
    })
    return logs.map(log => ({
      address: '0x' + (log.topics[1] ?? '').slice(-40),
      blockNumber: log.blockNumber ?? 0n,
    }))
  } catch {
    return []
  }
}
