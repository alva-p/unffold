import { getAddress, isAddress, type PublicClient } from 'viem'

// "Who controls this": follow an admin/owner address until it reaches a key, a multisig, a timelock or a DAO.
// Read-only probes; each hop tries the cheap, well-known interfaces in turn.

export type HopKind = 'renounced' | 'eoa' | 'safe' | 'timelock' | 'dao' | 'owned' | 'contract'

export interface ControlHop {
  address: string
  kind: HopKind
  detail: string
  delaySeconds?: number
}

export interface ControlPath {
  role: 'upgrades' | 'owner'
  hops: ControlHop[]
  summary: string
  totalDelaySeconds: number
  singleKeyNoDelay: boolean
}

const ZERO = '0x0000000000000000000000000000000000000000'
const SAFE_SENTINEL = '0x0000000000000000000000000000000000000001'
const MAX_HOPS = 5

export function formatDelay(seconds: number): string {
  if (seconds >= 86_400) return `${+(seconds / 86_400).toFixed(1)}d`
  if (seconds >= 3_600) return `${+(seconds / 3_600).toFixed(1)}h`
  if (seconds >= 60) return `${Math.round(seconds / 60)}m`
  return `${seconds}s`
}

type Out = 'address' | 'uint256' | 'address[]'

async function call<T>(client: PublicClient, address: string, name: string, out: Out, args: unknown[] = []): Promise<T | null> {
  const inputs = args.length === 2 ? [{ name: 'start', type: 'address' }, { name: 'pageSize', type: 'uint256' }] : []
  const outputs = name === 'getModulesPaginated'
    ? [{ name: 'array', type: 'address[]' }, { name: 'next', type: 'address' }]
    : [{ name: '', type: out }]
  try {
    return await client.readContract({
      address: address as `0x${string}`,
      abi: [{ type: 'function', name, inputs, outputs, stateMutability: 'view' }],
      functionName: name,
      args,
    }) as T
  } catch {
    return null
  }
}

async function classify(client: PublicClient, address: string): Promise<{ hop: ControlHop; next?: string }> {
  if (address.toLowerCase() === ZERO) return { hop: { address, kind: 'renounced', detail: 'renounced (0x0)' } }

  const code = await client.getCode({ address: address as `0x${string}` }).catch(() => undefined)
  if (!code || code === '0x') return { hop: { address, kind: 'eoa', detail: 'single key (EOA)' } }
  if (code.toLowerCase().startsWith('0xef0100')) return { hop: { address, kind: 'eoa', detail: 'single key (EOA with EIP-7702 delegation)' } }

  const [threshold, owners] = await Promise.all([
    call<bigint>(client, address, 'getThreshold', 'uint256'),
    call<string[]>(client, address, 'getOwners', 'address[]'),
  ])
  if (threshold !== null && owners) {
    const modules = await call<[string[], string]>(client, address, 'getModulesPaginated', 'address[]', [SAFE_SENTINEL, 10n])
    const moduleCount = modules?.[0]?.length ?? 0
    const detail = `Safe ${threshold}/${owners.length}${moduleCount ? `, ${moduleCount} module(s) can act without signers` : ''}`
    return { hop: { address, kind: 'safe', detail } }
  }

  const minDelay = await call<bigint>(client, address, 'getMinDelay', 'uint256')
  if (minDelay !== null) {
    // proposers are roles (not enumerable via calls), so the path stops here
    return { hop: { address, kind: 'timelock', detail: `timelock, min delay ${formatDelay(Number(minDelay))}`, delaySeconds: Number(minDelay) } }
  }

  const [compoundDelay, compoundAdmin] = await Promise.all([
    call<bigint>(client, address, 'delay', 'uint256'),
    call<string>(client, address, 'admin', 'address'),
  ])
  if (compoundDelay !== null && compoundAdmin && isAddress(compoundAdmin)) {
    return {
      hop: { address, kind: 'timelock', detail: `timelock, delay ${formatDelay(Number(compoundDelay))}`, delaySeconds: Number(compoundDelay) },
      next: getAddress(compoundAdmin),
    }
  }

  if (await call<string>(client, address, 'acl', 'address')) {
    return { hop: { address, kind: 'dao', detail: 'Aragon DAO (permissions set by DAO votes)' } }
  }

  const owner = await call<string>(client, address, 'owner', 'address')
  if (owner && isAddress(owner)) return { hop: { address, kind: 'owned', detail: 'contract with an owner' }, next: getAddress(owner) }

  return { hop: { address, kind: 'contract', detail: 'contract with unrecognized control logic' } }
}

// Only claim "no delay" when the path ends somewhere that acts immediately.
function delayText(totalDelaySeconds: number, lastKind?: HopKind): string {
  if (totalDelaySeconds) return `total delay ${formatDelay(totalDelaySeconds)}`
  if (lastKind === 'dao') return 'delay set by governance votes'
  if (lastKind === 'contract' || lastKind === 'owned') return 'delay unknown'
  return 'no delay'
}

export async function resolveControl(client: PublicClient, role: ControlPath['role'], start: string): Promise<ControlPath> {
  const hops: ControlHop[] = []
  let next: string | undefined = start
  while (next && hops.length < MAX_HOPS && !hops.some(hop => hop.address === next)) {
    const step: { hop: ControlHop; next?: string } = await classify(client, next)
    hops.push(step.hop)
    next = step.next
  }
  const totalDelaySeconds = hops.reduce((sum, hop) => sum + (hop.delaySeconds ?? 0), 0)
  const last = hops[hops.length - 1]
  return {
    role,
    hops,
    totalDelaySeconds,
    singleKeyNoDelay: last?.kind === 'eoa' && totalDelaySeconds === 0,
    summary: `${hops.map(hop => hop.detail).join(' → ')} · ${delayText(totalDelaySeconds, last?.kind)}`,
  }
}

// Upgrade controller (proxy admin, or the owner for UUPS/beacon) and the contract owner, deduplicated.
export async function resolveControlPaths(client: PublicClient, address: string, adminAddress?: string): Promise<ControlPath[]> {
  const owner = await call<string>(client, address, 'owner', 'address')
  const paths: ControlPath[] = []
  if (adminAddress) paths.push(await resolveControl(client, 'upgrades', adminAddress))
  if (owner && isAddress(owner) && owner.toLowerCase() !== adminAddress?.toLowerCase()) {
    paths.push(await resolveControl(client, 'owner', getAddress(owner)))
  }
  return paths
}
