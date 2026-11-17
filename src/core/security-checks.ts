import { parse, visit } from '@solidity-parser/parser'
import type {
  ASTNode,
  BaseASTNode,
  ContractDefinition,
  FunctionCall,
  FunctionDefinition,
  SourceUnit,
  VariableDeclaration,
} from '@solidity-parser/parser/dist/src/ast-types'
import { keccak256, toHex, type PublicClient } from 'viem'
import { analysisContractFor, validateAnalyzeAddress } from './analyzer.js'
import { resolveControlPaths, type ControlPath } from './control.js'
import { resolveProxyChain } from './proxy-detector.js'
import { resolveContract } from './resolver.js'
import { createClient, getChainConfig } from './rpc.js'
import type { AbiItem, ChainConfig, Config, ProxyInfo, ResolvedContract } from '../types.js'

export type Severity = 'info' | 'low' | 'medium' | 'high'
export type Confidence = 'low' | 'medium' | 'high'

// A triage signal for a human to verify, not a confirmed vulnerability.
export interface Finding {
  id: string
  title: string
  severity: Severity
  confidence: Confidence
  detail: string
  falsePositives: string
  recommendation: string
  file?: string
  line?: number
  code?: string  // the source line at file:line, trimmed
  evidence?: string[]  // on-chain reads backing the finding, verifiable by anyone
}

export const DOCS_URL = 'https://github.com/alva-p/unffold/blob/main/docs/detectors.md'

export function docsUrl(id: string): string {
  return `${DOCS_URL}#${id}`
}

// Stable across re-scans and line shifts: keyed by what the finding is, not where it moved to.
export function fingerprint(finding: Finding, chainId: number, address: string): `0x${string}` {
  const anchor = finding.code?.replace(/\s+/g, ' ') ?? finding.title
  return keccak256(toHex(`${chainId}:${address.toLowerCase()}:${finding.id}:${finding.file ?? ''}:${anchor}`))
}

export interface ParsedContract {
  file: string
  node: ContractDefinition
  // false for vendored code (OZ, solmate, solady, lib/, node_modules/): used as context, never reported
  firstParty: boolean
}

export interface CheckContext {
  sources: Record<string, string>
  proxy: ProxyInfo | null
  client?: PublicClient
  address?: string
  implementationAddress?: string
  chainName?: string
  blockNumber?: bigint  // pin on-chain reads to one block so the evidence is reproducible
}

type Detector = (contracts: ParsedContract[], ctx: CheckContext) => Finding[] | Promise<Finding[]>

const VENDORED_PATH = /(^|\/)(node_modules|lib|dependencies)\/|^@|openzeppelin|forge-std|solmate|solady/i
// ponytail: header sniffing for flattened single-file sources; a first-party contract whose
// preamble mentions these strings is treated as vendored. Upgrade path: compiler AST source ids.
const VENDORED_HEADER = /OpenZeppelin Contracts|@author Solmate|@author Solady|File: (@|lib\/|node_modules\/)/

const SEVERITY_ORDER: Record<Severity, number> = { high: 3, medium: 2, low: 1, info: 0 }

export function parseSources(sources: Record<string, string>): { contracts: ParsedContract[]; failed: string[] } {
  const contracts: ParsedContract[] = []
  const failed: string[] = []
  for (const [file, content] of Object.entries(sources)) {
    let unit: SourceUnit & { errors?: unknown[] }
    try {
      unit = parse(content, { loc: true, range: true, tolerant: true }) as SourceUnit & { errors?: unknown[] }
    } catch {
      failed.push(file)
      continue
    }
    if (unit.errors?.length) failed.push(file)
    let prevEnd = 0
    for (const child of unit.children ?? []) {
      if (child.type === 'ContractDefinition' && child.range) {
        const preamble = content.slice(prevEnd, child.range[0])
        contracts.push({
          file,
          node: child,
          firstParty: !VENDORED_PATH.test(file) && !VENDORED_HEADER.test(preamble),
        })
      }
      if (child.range) prevEnd = child.range[1] + 1
    }
  }
  return { contracts, failed }
}

function reportable(contracts: ParsedContract[]): ParsedContract[] {
  return contracts.filter(contract => contract.firstParty && contract.node.kind !== 'interface')
}

function at(contract: ParsedContract, node: BaseASTNode): Pick<Finding, 'file' | 'line'> {
  return { file: contract.file, line: node.loc?.start.line }
}

function isMember(node: ASTNode | null | undefined, object: string, member: string): boolean {
  return node?.type === 'MemberAccess'
    && node.memberName === member
    && node.expression.type === 'Identifier'
    && node.expression.name === object
}

function functionsOf(contract: ParsedContract): FunctionDefinition[] {
  return contract.node.subNodes.filter((node): node is FunctionDefinition => node.type === 'FunctionDefinition')
}

// ── Upgradeability ──────────────────────────────────────────────────────────

const detectUpgradeability: Detector = (_contracts, ctx) => {
  if (!ctx.proxy) return []
  const proxy = ctx.proxy
  return [{
    id: 'upgradeable',
    title: 'Upgradeable proxy',
    severity: 'medium',
    confidence: 'high',
    detail: `${proxy.pattern} → implementation ${proxy.implementationAddress}${proxy.adminAddress ? `, admin ${proxy.adminAddress}` : ''}. Logic can change after deployment.`,
    falsePositives: 'Expected for most protocols. The risk depends on who controls upgrades, not on upgradeability itself.',
    recommendation: 'Check whether upgrades are gated by a multisig, timelock, or governance process.',
    evidence: [
      proxy.proxySlot ? `storage ${proxy.proxySlot} at ${ctx.address} = ${proxy.implementationAddress}` : `implementation = ${proxy.implementationAddress}`,
      ...(proxy.adminAddress ? [`admin = ${proxy.adminAddress}`] : []),
    ],
  }]
}

// ── Access control on privileged-looking functions ──────────────────────────

const PRIVILEGED_PATTERNS = [
  /^set[A-Z]/, /^add[A-Z]/, /^remove[A-Z]/, /^update[A-Z]/,
  /^change[A-Z]/, /^replace[A-Z]/, /^toggle[A-Z]/,
  /pause$|^pause|^unpause/,
  /freeze|lock(?!ed)|unlock/i,
  /upgrade|upgradeTo/i,
  /^grant|^revoke|^renounce/,
  /whitelist|blacklist|allowlist|denylist/i,
  /^sweep|^rescue|^recover[A-Z]/,
  /emergency/i,
  /^mint(?!ed)|^burn(?!ed)/,
  /admin|owner|operator|guardian|manager/i,
  /^initiali[sz]e|^init$/,
]

export const SEVERITIES: Severity[] = ['info', 'low', 'medium', 'high']

export function atLeast(severity: Severity, threshold: Severity): boolean {
  return SEVERITY_ORDER[severity] >= SEVERITY_ORDER[threshold]
}

export function looksPrivileged(name: string): boolean {
  return PRIVILEGED_PATTERNS.some(pattern => pattern.test(name))
}

// Access-control modifiers. Deliberately excludes whenNotPaused / nonReentrant: they are not auth.
const GUARD_MODIFIER = /^only|only$|^auth$|^requiresAuth$|^restricted$|initiali[sz]|^isOwner$|^isAdmin$|^governance/i
// Internal auth helpers called from the body (OZ _checkOwner/_checkRole, _msgSender, solmate isAuthorized).
const AUTH_CALL = /^_(check|only|auth|isAuthorized|msgSender)|^(hasRole|isAuthorized|canCall)$/i

function hasAuthInBody(fn: FunctionDefinition): boolean {
  let found = false
  if (!fn.body) return false
  visit(fn.body, {
    MemberAccess(node) {
      if (isMember(node, 'msg', 'sender')) found = true
    },
    FunctionCall(node) {
      const callee = node.expression
      const name = callee.type === 'Identifier' ? callee.name : callee.type === 'MemberAccess' ? callee.memberName : null
      if (name && AUTH_CALL.test(name)) found = true
    },
  })
  return found
}

// Custom one-time flags, e.g. USDC's require(!initialized) / _initializedVersion
function hasInitFlagInBody(fn: FunctionDefinition): boolean {
  let found = false
  if (fn.body) visit(fn.body, { Identifier(node) { if (/initiali[sz](ed|ing)|version/i.test(node.name)) found = true } })
  return found
}

// One level into same-contract helpers, e.g. Uniswap's removeLiquidityETH → removeLiquidity, which uses msg.sender.
// ponytail: one level, same contract only; inherited helpers still count as unchecked.
function callsAuthHelper(contract: ParsedContract, fn: FunctionDefinition): boolean {
  const helpers = new Map(functionsOf(contract).filter(other => other !== fn && other.name).map(other => [other.name!, other]))
  let found = false
  visit(fn.body!, {
    FunctionCall(call) {
      const helper = call.expression.type === 'Identifier' ? helpers.get(call.expression.name) : undefined
      if (helper && (helper.modifiers.some(modifier => GUARD_MODIFIER.test(modifier.name)) || hasAuthInBody(helper))) found = true
    },
  })
  return found
}

const detectAccessControl: Detector = contracts => {
  const out: Finding[] = []
  for (const contract of reportable(contracts)) {
    for (const fn of functionsOf(contract)) {
      if (!fn.name || fn.isConstructor || fn.isFallback || fn.isReceiveEther || !fn.body) continue
      if (fn.visibility === 'internal' || fn.visibility === 'private') continue
      if (fn.stateMutability === 'view' || fn.stateMutability === 'pure' || fn.stateMutability === 'constant') continue
      if (!looksPrivileged(fn.name)) continue
      if (fn.modifiers.some(modifier => GUARD_MODIFIER.test(modifier.name))) continue
      if (hasAuthInBody(fn) || callsAuthHelper(contract, fn)) continue

      const isInit = /^initiali[sz]e|^init$/.test(fn.name)
      if (isInit && hasInitFlagInBody(fn)) continue
      out.push(isInit
        ? {
          id: 'unprotected-initializer',
          title: `Initializer without guard: ${contract.node.name}.${fn.name}`,
          severity: 'high',
          confidence: 'medium',
          detail: `${fn.name}() is externally callable with no initializer/access modifier and no msg.sender check.`,
          falsePositives: 'One-time guards that do not reference an initialized/initializing/version flag are not recognized.',
          recommendation: 'Verify it can only run once (OZ initializer) and that the proxy was initialized atomically on deploy.',
          ...at(contract, fn),
        }
        : {
          id: 'unprotected-privileged',
          title: `Privileged-looking function without access control: ${contract.node.name}.${fn.name}`,
          severity: 'medium',
          confidence: 'medium',
          detail: `${fn.name}() changes state, has no access-control modifier, and never checks msg.sender.`,
          falsePositives: 'Name-based heuristic: the function may be intentionally public, or auth may live in a helper with an unusual name.',
          recommendation: 'Confirm whether any caller should be able to invoke this.',
          ...at(contract, fn),
        })
    }
  }
  return out
}

// ── UUPS _authorizeUpgrade without access control ───────────────────────────

const detectUupsAuth: Detector = contracts => {
  const out: Finding[] = []
  for (const contract of reportable(contracts)) {
    for (const fn of functionsOf(contract)) {
      if (fn.name !== '_authorizeUpgrade' || !fn.body) continue
      if (fn.modifiers.some(modifier => GUARD_MODIFIER.test(modifier.name))) continue
      if (hasAuthInBody(fn)) continue

      const empty = fn.body.statements.length === 0 && fn.modifiers.length === 0
      out.push({
        id: 'uups-unprotected-upgrade',
        title: `UUPS upgrade authorization without caller check: ${contract.node.name}`,
        severity: empty ? 'high' : 'medium',
        confidence: empty ? 'high' : 'low',
        detail: empty
          ? '_authorizeUpgrade is empty and has no modifier, so anyone may be able to call upgradeToAndCall and replace the logic.'
          : '_authorizeUpgrade has no recognized access-control modifier and never checks msg.sender.',
        falsePositives: empty
          ? 'Intentionally immutable deployments that never route upgrades through this proxy.'
          : 'Auth may live in a modifier or helper with an unrecognized name; read the body and modifiers.',
        recommendation: 'Confirm only a trusted owner/role/timelock can pass this check.',
        ...at(contract, fn),
      })
    }
  }
  return out
}

// UUPS keeps the upgrade function in the implementation: if it is missing, the next upgrade is impossible.
// All contracts are scanned (including vendored OZ, where upgradeToAndCall usually lives).
const detectUupsMissingUpgrade: Detector = (contracts, ctx) => {
  if (!ctx.proxy?.pattern.includes('UUPS') || contracts.length === 0) return []
  const hasUpgrade = contracts.some(contract => functionsOf(contract).some(fn => /^upgradeTo(AndCall)?$/.test(fn.name ?? '')))
  if (hasUpgrade) return []
  return [{
    id: 'uups-no-upgrade-function',
    title: 'UUPS implementation has no upgradeTo / upgradeToAndCall',
    severity: 'medium',
    confidence: 'medium',
    detail: 'In UUPS the upgrade function lives in the implementation. Without it, this proxy can no longer be upgraded, including for an emergency fix.',
    falsePositives: 'The team intentionally froze the contract, or the upgrade entry point has a non-standard name.',
    recommendation: 'Confirm whether freezing upgrades was intended, and how bugs would be fixed.',
  }]
}

// ── Uninitialized proxy / implementation ────────────────────────────────────

// OZ v5 ERC-7201 namespace: keccak256(abi.encode(uint256(keccak256("openzeppelin.storage.Initializable")) - 1)) & ~0xff
const OZ5_INITIALIZABLE_SLOT = '0xf0c57e16840df040f15088dc2f81fe391c3923bec73e23a9662efc9c229c6a00' as const
const UINT64_MAX = (1n << 64n) - 1n

function callsFunction(node: BaseASTNode, name: string): boolean {
  let found = false
  visit(node, { FunctionCall(call) { if (call.expression.type === 'Identifier' && call.expression.name === name) found = true } })
  return found
}

async function initializedVersion(client: PublicClient, address: string, blockNumber?: bigint): Promise<bigint | null> {
  try {
    const raw = await client.getStorageAt({ address: address as `0x${string}`, slot: OZ5_INITIALIZABLE_SLOT, blockNumber })
    return BigInt(raw ?? '0x0') & UINT64_MAX
  } catch {
    return null
  }
}

const detectInitState: Detector = async (contracts, ctx) => {
  const mine = reportable(contracts)
  const initializers = mine.flatMap(contract => functionsOf(contract)
    .filter(fn => fn.modifiers.some(modifier => /^(re)?initializer$/.test(modifier.name)))
    .map(fn => ({ contract, fn })))
  if (initializers.length === 0) return []
  const first = initializers[0]

  // ponytail: on-chain state only for OZ v5's fixed slot; v4 keeps _initialized at a layout-dependent
  // slot, so it gets the static check below. Upgrade path: compiler storageLayout (see P7).
  const isOz5 = Object.values(ctx.sources).some(source => source.includes('InitializableStorage'))
  if (isOz5 && ctx.client && ctx.address) {
    const instance = await initializedVersion(ctx.client, ctx.address, ctx.blockNumber)
    const impl = ctx.proxy && ctx.implementationAddress ? await initializedVersion(ctx.client, ctx.implementationAddress, ctx.blockNumber) : null
    const read = (address: string) => `storage ${OZ5_INITIALIZABLE_SLOT} at ${address} = 0 (uint64 _initialized)${ctx.blockNumber ? `, block ${ctx.blockNumber}` : ''}`
    if (instance !== null) {
      const out: Finding[] = []
      if (instance === 0n) {
        out.push({
          id: 'uninitialized-instance',
          title: ctx.proxy ? 'Proxy is not initialized' : 'Contract is not initialized',
          severity: 'high',
          confidence: 'high',
          detail: `The OZ v5 Initializable slot at ${ctx.address} reads 0, so ${first.fn.name}() is still callable by whoever calls it first.`,
          falsePositives: 'Deployments that are intentionally left uninitialized until a later, controlled transaction.',
          recommendation: 'Confirm whether this deployment is live; initialization should happen atomically with deployment.',
          evidence: [read(ctx.address)],
          ...at(first.contract, first.fn),
        })
      }
      if (impl === 0n) {
        out.push({
          id: 'uninitialized-implementation',
          title: 'Implementation is not initialized and initializers are not disabled',
          severity: 'medium',
          confidence: 'high',
          detail: `The implementation ${ctx.implementationAddress} can be initialized by anyone, who then owns the implementation contract itself. Since Cancun this rarely destroys the proxy, but treat it as high if the implementation can reach delegatecall or selfdestruct.`,
          falsePositives: 'Implementations with no privileged logic reachable after initialization.',
          recommendation: 'Implementations should call _disableInitializers() in their constructor.',
          evidence: [read(ctx.implementationAddress!)],
          ...at(first.contract, first.fn),
        })
      }
      return out
    }
  }

  const disabled = mine.some(contract => functionsOf(contract).some(fn => fn.isConstructor && fn.body
    && (callsFunction(fn.body, '_disableInitializers') || fn.modifiers.some(modifier => modifier.name === 'initializer'))))
  if (disabled) return []
  return [{
    id: 'initializers-not-disabled',
    title: `Constructor does not disable initializers: ${first.contract.node.name}`,
    severity: 'medium',
    confidence: 'medium',
    detail: `${first.fn.name}() uses an initializer, but no constructor calls _disableInitializers(), so the implementation contract may be initializable by anyone.`,
    falsePositives: 'Contracts deployed directly (not behind a proxy) and initialized in the same transaction; implementations already initialized by the deployer.',
    recommendation: 'Read the implementation\'s initialized state on-chain, or add _disableInitializers() to the constructor.',
    ...at(first.contract, first.fn),
  }]
}

// ── Unchecked low-level call return ─────────────────────────────────────────

const LOW_LEVEL = new Set(['call', 'delegatecall', 'staticcall', 'send'])

function lowLevelCall(node: ASTNode | null | undefined): string | null {
  if (node?.type !== 'FunctionCall') return null
  const callee = node.expression.type === 'NameValueExpression' ? node.expression.expression : node.expression
  if (callee.type !== 'MemberAccess' || !LOW_LEVEL.has(callee.memberName)) return null
  // ERC-777 send(to, amount, data) reverts on failure; native send takes one argument
  if (callee.memberName === 'send' && node.arguments.length !== 1) return null
  return callee.memberName
}

function countIdentifier(node: BaseASTNode, name: string): number {
  let count = 0
  visit(node, { Identifier(id) { if (id.name === name) count++ } })
  return count
}

const detectUncheckedCalls: Detector = contracts => {
  const out: Finding[] = []
  for (const contract of reportable(contracts)) {
    for (const fn of functionsOf(contract)) {
      if (!fn.body) continue
      const body = fn.body
      const report = (node: BaseASTNode, kind: string, how: string) => out.push({
        id: 'unchecked-low-level-call',
        title: `Unchecked .${kind}() return in ${contract.node.name}.${fn.name ?? '(fallback)'}`,
        severity: 'medium',
        confidence: 'high',
        detail: `The success flag of .${kind}() is ${how}, so a failed call does not revert and execution continues as if it succeeded.`,
        falsePositives: 'Deliberate best-effort calls (refunds, keeper tips) where failure is acceptable.',
        recommendation: 'Check whether a failed call can leave accounting inconsistent or funds stuck.',
        ...at(contract, node),
      })

      visit(body, {
        ExpressionStatement(node) {
          const bare = lowLevelCall(node.expression)
          if (bare) return report(node, bare, 'discarded')
          // (ok, ) = target.call(...)  — the assignment itself references `ok` once
          const expr = node.expression
          if (expr?.type !== 'BinaryOperation' || expr.operator !== '=') return
          const kind = lowLevelCall(expr.right)
          if (!kind) return
          const target = (expr.left.type === 'TupleExpression' ? expr.left.components[0] : expr.left) as ASTNode | null
          if (!target || target.type !== 'Identifier') return report(node, kind, 'dropped')
          if (countIdentifier(body, target.name) < 2) report(node, kind, 'assigned but never read')
        },
        VariableDeclarationStatement(node) {
          const kind = lowLevelCall(node.initialValue)
          if (!kind) return
          const first = node.variables[0] as VariableDeclaration | null
          if (!first || !first.name) return report(node, kind, 'dropped')
          // the declaration's own identifier node counts once
          if (countIdentifier(body, first.name) < 2) report(node, kind, 'assigned but never read')
        },
      })
    }
  }
  return out
}

// ── Chainlink oracle staleness ──────────────────────────────────────────────

const COMPARISON = new Set(['<', '>', '<=', '>=', '==', '!='])
const L2_CHAINS = new Set(['arbitrum', 'optimism', 'base'])

function isMemberCall(node: ASTNode | null | undefined, member: string): boolean {
  return node?.type === 'FunctionCall' && node.expression.type === 'MemberAccess' && node.expression.memberName === member
}

function mentions(node: BaseASTNode, test: (node: ASTNode) => boolean): boolean {
  let found = false
  visit(node, {
    Identifier(id) { if (test(id)) found = true },
    MemberAccess(member) { if (test(member)) found = true },
  })
  return found
}

const isId = (name: string) => (node: ASTNode) => node.type === 'Identifier' && node.name === name

// A comparison that involves `name` (and block.timestamp when required).
function compared(body: BaseASTNode, name: string, withTimestamp: boolean): boolean {
  let found = false
  visit(body, {
    BinaryOperation(op) {
      if (!COMPARISON.has(op.operator) || !mentions(op, isId(name))) return
      if (!withTimestamp || mentions(op, node => isMember(node, 'block', 'timestamp'))) found = true
    },
  })
  return found
}

// Handed to a helper, or returned as-is to the caller (casts like uint256(x) do not count).
function handedOff(fn: FunctionDefinition, name: string): boolean {
  if ((fn.returnParameters ?? []).some(param => param.name === name)) return true
  let found = false
  visit(fn.body!, {
    FunctionCall(call) {
      if (call.expression.type === 'ElementaryTypeName') return
      if (call.arguments.some(arg => isId(name)(arg))) found = true
    },
    ReturnStatement(ret) {
      const expr = ret.expression
      if (!expr) return
      if (isId(name)(expr)) found = true
      if (expr.type === 'TupleExpression' && expr.components.some(c => c && isId(name)(c as ASTNode))) found = true
    },
  })
  return found
}

// ── transferFrom with a caller-chosen `from` ────────────────────────────────

// The `from` argument of token.transferFrom(from,…), token.safeTransferFrom(from,…) or SafeERC20.safeTransferFrom(token, from,…).
function transferFromSource(call: FunctionCall): ASTNode | null {
  const callee = call.expression
  if (callee.type !== 'MemberAccess' || !/^(safeT|t)ransferFrom$/.test(callee.memberName)) return null
  // Library form (SafeERC20, TransferHelper…): called on a capitalized name, token first. ERC-721 `nft.safeTransferFrom(from, to, id, data)` is member form.
  const library = callee.expression.type === 'Identifier' && /^[A-Z]/.test(callee.expression.name) && call.arguments.length === 4
  return (library ? call.arguments[1] : call.arguments[0]) ?? null
}

// Who `from` is allowed to be: compared with something, or used as an allowance key next to msg.sender.
function fromIsChecked(fn: FunctionDefinition, name: string): boolean {
  if (compared(fn.body!, name, false)) return true
  let found = false
  visit(fn.body!, {
    IndexAccess(index) { if (mentions(index, isId(name)) && mentions(index, node => isMember(node, 'msg', 'sender'))) found = true },
    FunctionCall(call) {
      const callee = call.expression
      const callName = callee.type === 'Identifier' ? callee.name : callee.type === 'MemberAccess' ? callee.memberName : ''
      if (/permit|signature|recover|verify/i.test(callName)) found = true
    },
  })
  return found
}

const detectArbitraryTransferFrom: Detector = contracts => {
  const out: Finding[] = []
  for (const contract of reportable(contracts)) {
    for (const fn of functionsOf(contract)) {
      if (!fn.body || !['external', 'public'].includes(fn.visibility)) continue
      if (fn.modifiers.some(modifier => GUARD_MODIFIER.test(modifier.name))) continue
      const params = new Set(fn.parameters.map(param => param.name).filter(Boolean))
      visit(fn.body, {
        FunctionCall(call) {
          const from = transferFromSource(call)
          if (!from || from.type !== 'Identifier' || !params.has(from.name) || fromIsChecked(fn, from.name)) return
          out.push({
            id: 'arbitrary-transfer-from',
            title: `transferFrom with a caller-chosen sender in ${fn.name ?? 'function'}`,
            severity: 'high',
            confidence: 'medium',
            detail: `\`${from.name}\` comes straight from the caller and is never checked against msg.sender, an allowance or a signature. Anyone may be able to move tokens from any address that approved this contract.`,
            falsePositives: 'The check happens in a helper or modifier with an unrecognized name, or the function is only reachable by trusted callers.',
            recommendation: `Confirm who can pass an arbitrary \`${from.name}\`. Users should never approve this contract for more than they intend to spend until this is clear.`,
            ...at(contract, call),
          })
        },
      })
    }
  }
  return out
}

const detectOracle: Detector = (contracts, ctx) => {
  const out: Finding[] = []
  let usesRoundData = false
  const mine = reportable(contracts)

  for (const contract of mine) {
    for (const fn of functionsOf(contract)) {
      if (!fn.body) continue
      const body = fn.body
      const where = `${contract.node.name}.${fn.name ?? '(fallback)'}`

      const check = (node: BaseASTNode, names: Array<string | null>) => {
        usesRoundData = true
        const [, answer, , updatedAt] = names
        if (!updatedAt || (!compared(body, updatedAt, true) && !handedOff(fn, updatedAt))) {
          out.push({
            id: 'oracle-stale-price',
            title: `Chainlink price without staleness check in ${where}`,
            severity: 'medium',
            confidence: updatedAt ? 'medium' : 'high',
            detail: updatedAt
              ? `updatedAt is read but never compared with block.timestamp, so a stale price is accepted.`
              : 'latestRoundData() discards updatedAt, so a stale price is accepted.',
            falsePositives: 'Staleness checked in the caller or by a separate circuit breaker.',
            recommendation: 'Check that the price is rejected when block.timestamp - updatedAt exceeds the feed heartbeat.',
            ...at(contract, node),
          })
        }
        if (answer && !compared(body, answer, false) && !handedOff(fn, answer)) {
          out.push({
            id: 'oracle-answer-unchecked',
            title: `Chainlink answer not validated in ${where}`,
            severity: 'low',
            confidence: 'medium',
            detail: 'The answer is used without checking it is positive; casting a negative int256 to uint256 yields a huge price.',
            falsePositives: 'Validation in the caller, or feeds that cannot report non-positive values in practice.',
            recommendation: 'Check that answer > 0 before use.',
            ...at(contract, node),
          })
        }
      }

      visit(body, {
        VariableDeclarationStatement(node) {
          if (!isMemberCall(node.initialValue, 'latestRoundData')) return
          check(node, node.variables.map(variable => (variable as VariableDeclaration | null)?.name ?? null))
        },
        ExpressionStatement(node) {
          const expr = node.expression
          if (expr?.type !== 'BinaryOperation' || expr.operator !== '=' || expr.left.type !== 'TupleExpression') return
          if (!isMemberCall(expr.right, 'latestRoundData')) return
          check(node, expr.left.components.map(c => {
            const component = c as ASTNode | null
            return component?.type === 'Identifier' ? component.name : null
          }))
        },
        FunctionCall(node) {
          if (!isMemberCall(node, 'latestAnswer') || node.arguments.length > 0) return
          out.push({
            id: 'oracle-latest-answer',
            title: `Deprecated latestAnswer() in ${where}`,
            severity: 'info',
            confidence: 'high',
            detail: 'latestAnswer() returns no timestamp, so staleness cannot be checked.',
            falsePositives: 'Non-Chainlink contracts exposing a function with the same name.',
            recommendation: 'Prefer latestRoundData() with staleness and answer checks.',
            ...at(contract, node),
          })
        },
      })
    }
  }

  // ponytail: text match on first-party sources; upgrade path is resolving the sequencer feed call.
  const sequencerAware = mine.some(contract => /sequencer/i.test(ctx.sources[contract.file] ?? ''))
  if (usesRoundData && ctx.chainName && L2_CHAINS.has(ctx.chainName) && !sequencerAware) {
    out.push({
      id: 'oracle-no-sequencer-check',
      title: 'No L2 sequencer uptime check',
      severity: 'low',
      confidence: 'low',
      detail: `On ${ctx.chainName}, Chainlink prices can be stale while the sequencer is down; no sequencer uptime feed reference was found.`,
      falsePositives: 'Checks implemented in another contract or under a name not containing "sequencer".',
      recommendation: 'Check whether prices are rejected during sequencer downtime and its grace period.',
    })
  }
  return out
}

// ── Dangerous primitives: selfdestruct, tx.origin, delegatecall ─────────────

const detectMarkers: Detector = contracts => {
  const out: Finding[] = []
  for (const contract of reportable(contracts)) {
    // tx.origin == msg.sender is an EOA check, not authorization
    const eoaChecks = new Set<number>()
    visit(contract.node, {
      BinaryOperation(node) {
        if (node.operator !== '==' && node.operator !== '!=') return
        if (isMember(node.left, 'tx', 'origin') && isMember(node.right, 'msg', 'sender')) eoaChecks.add(node.left.range![0])
        if (isMember(node.right, 'tx', 'origin') && isMember(node.left, 'msg', 'sender')) eoaChecks.add(node.right.range![0])
      },
    })

    const selfdestruct = (node: BaseASTNode) => out.push({
      id: 'selfdestruct',
      title: `selfdestruct in ${contract.node.name}`,
      severity: 'medium',
      confidence: 'high',
      detail: 'Since Cancun (EIP-6780) selfdestruct only deletes code in the creation tx, but it still sends the whole ETH balance.',
      falsePositives: 'Unreachable or properly gated paths; chains without EIP-6780 keep the old semantics (higher impact).',
      recommendation: 'Check who can reach this call and where the balance goes.',
      ...at(contract, node),
    })
    const delegatecall = (node: BaseASTNode) => out.push({
      id: 'delegatecall',
      title: `delegatecall in ${contract.node.name}`,
      severity: 'medium',
      confidence: 'low',
      detail: 'Delegatecall runs external code against this contract\'s storage and balance.',
      falsePositives: 'Proxy plumbing and multicall-to-self are normal uses.',
      recommendation: 'Check whether the target or calldata can be controlled by an untrusted caller.',
      ...at(contract, node),
    })

    visit(contract.node, {
      FunctionCall(node) {
        if (node.expression.type === 'Identifier' && (node.expression.name === 'selfdestruct' || node.expression.name === 'suicide')) selfdestruct(node)
      },
      AssemblyCall(node) {
        if (node.functionName === 'selfdestruct') selfdestruct(node)
        if (node.functionName === 'delegatecall') delegatecall(node)
      },
      MemberAccess(node) {
        if (node.memberName === 'delegatecall') delegatecall(node)
        if (isMember(node, 'tx', 'origin') && !eoaChecks.has(node.range![0])) {
          out.push({
            id: 'tx-origin',
            title: `tx.origin in ${contract.node.name}`,
            severity: 'medium',
            confidence: 'medium',
            detail: 'tx.origin-based authorization can be bypassed by a malicious contract the victim interacts with.',
            falsePositives: 'Logging or gas-refund uses that do not gate access.',
            recommendation: 'Check whether tx.origin gates privileged behavior; prefer msg.sender.',
            ...at(contract, node),
          })
        }
      },
    })
  }
  return out
}

// ── Runner ──────────────────────────────────────────────────────────────────

const DETECTORS: Detector[] = [detectUpgradeability, detectAccessControl, detectUupsAuth, detectUupsMissingUpgrade, detectArbitraryTransferFrom, detectInitState, detectUncheckedCalls, detectOracle, detectMarkers]

// Shown with every result so a clean scan is never read as "safe".
export const COVERAGE = {
  checked: [
    'upgradeability and who controls it (EOA, Safe, timelock, DAO)',
    'access control on privileged-looking functions',
    'UUPS upgrade authorization and upgrade function',
    'initializer state (on-chain for OZ v5)',
    'unchecked low-level calls',
    'transferFrom with a caller-chosen sender',
    'Chainlink price validation',
    'selfdestruct, tx.origin, delegatecall',
  ],
  notChecked: [
    'reentrancy',
    'business and economic logic',
    'price or oracle manipulation',
    'interactions with other contracts',
  ],
}

const CONFIDENCE_ORDER: Record<Confidence, number> = { high: 2, medium: 1, low: 0 }

export function compareFindings(a: Finding, b: Finding): number {
  return SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]
    || CONFIDENCE_ORDER[b.confidence] - CONFIDENCE_ORDER[a.confidence]
}

export async function runChecks(ctx: CheckContext): Promise<Finding[]> {
  const { contracts, failed } = parseSources(ctx.sources)
  const findings: Finding[] = []

  if (Object.keys(ctx.sources).length === 0) {
    findings.push({
      id: 'no-source',
      title: 'Source not verified: static checks skipped',
      severity: 'info',
      confidence: 'high',
      detail: 'No verified source was found on Etherscan or Sourcify, so only on-chain checks ran.',
      falsePositives: 'n/a',
      recommendation: 'Treat a clean result as incomplete until the source is verified.',
    })
  }
  for (const file of failed) {
    findings.push({
      id: 'parse-partial',
      title: `Source only partially parsed: ${file}`,
      severity: 'info',
      confidence: 'high',
      detail: 'The Solidity parser reported errors; findings in this file may be missing.',
      falsePositives: 'n/a',
      recommendation: 'Review this file manually.',
      file,
    })
  }

  for (const detector of DETECTORS) findings.push(...await detector(contracts, ctx))
  for (const finding of findings) {
    if (finding.file && finding.line) finding.code = ctx.sources[finding.file]?.split('\n')[finding.line - 1]?.trim().slice(0, 140)
  }
  return findings.sort(compareFindings)
}

// ── Address → scan ──────────────────────────────────────────────────────────

export interface SecurityScan {
  address: string
  chain: ChainConfig
  contract: { name: string; verified: boolean }
  // the code actually analyzed: the implementation when the address is a proxy
  target: { address: string; name: string; verified: boolean; file?: string }
  proxy: ProxyInfo | null
  stats: { stateChanging: number; privilegedLooking: number }
  // snapshot: results reflect this block; a later upgrade or config change can invalidate them
  block: string
  scannedAt: string
  control: ControlPath[]  // who can upgrade / administer, followed to the final key, multisig, timelock or DAO
  findings: Finding[]
}

function controlFindings(control: ControlPath[], isProxy: boolean): Finding[] {
  // without an admin slot (UUPS, beacon) the owner is usually who upgrades
  const ownerUpgrades = isProxy && !control.some(path => path.role === 'upgrades')
  return control.filter(path => path.singleKeyNoDelay).map(path => {
    const upgrades = path.role === 'upgrades' || ownerUpgrades
    return {
      id: 'single-key-control',
      title: upgrades ? 'One key can upgrade this contract with no delay' : 'One key administers this contract with no delay',
      severity: upgrades ? 'medium' : 'low',
      confidence: 'high',
      detail: `${path.role === 'upgrades' ? 'Upgrade' : 'Owner'} control path: ${path.summary}. Whoever holds that key can change the contract's behavior immediately.`,
      falsePositives: 'Keys held in MPC or hardware custody look like a single EOA on-chain.',
      recommendation: 'Check who holds this key and whether the team has committed to a multisig or timelock.',
      evidence: path.hops.map(hop => `${hop.address}: ${hop.detail}`),
    } satisfies Finding
  })
}

// Absolute build paths (/Users/me/repo/contracts/X.sol) leak the deployer's machine layout and
// never match a repo; strip their common directory so findings read contracts/X.sol.
export function shortenPaths(sources: Record<string, string>): Record<string, string> {
  const absolute = Object.keys(sources).filter(path => path.startsWith('/'))
  if (absolute.length === 0) return sources
  let prefix = absolute[0].slice(0, absolute[0].lastIndexOf('/') + 1)
  for (const path of absolute) while (!path.startsWith(prefix)) prefix = prefix.slice(0, prefix.slice(0, -1).lastIndexOf('/') + 1)
  return Object.fromEntries(Object.entries(sources).map(([path, content]) => [path.startsWith('/') ? path.slice(prefix.length) || path : path, content]))
}

function sourcesOf(contract: ResolvedContract): Record<string, string> {
  if (contract.sources && Object.keys(contract.sources).length > 0) return shortenPaths(contract.sources)
  return contract.sourceCode ? { [`${contract.name}.sol`]: contract.sourceCode } : {}
}

function isStateChanging(item: AbiItem): boolean {
  return item.type === 'function' && item.stateMutability !== 'view' && item.stateMutability !== 'pure'
}

export async function scanSecurity(
  rawAddress: string,
  chainName: string,
  config: Config,
  rpcOverride?: string
): Promise<SecurityScan> {
  const address = validateAnalyzeAddress(rawAddress)
  const chain = getChainConfig(chainName)
  const client = createClient(chainName, config, rpcOverride)
  const contract = await resolveContract(address, chainName, config)
  const proxy = await resolveProxyChain(address, contract.abi, client)
  const target = await analysisContractFor(contract, chainName, config, proxy?.implementationAddress ?? null)
  const [blockNumber, control] = await Promise.all([
    client.getBlockNumber(),
    resolveControlPaths(client, address, proxy?.adminAddress),
  ])

  const stateChanging = (target.abi ?? []).filter(isStateChanging)
  const sources = sourcesOf(target)
  const declares = new RegExp(`\\bcontract\\s+${target.name}\\b`)
  const findings = await runChecks({
    sources,
    proxy,
    client,
    address,
    implementationAddress: proxy?.implementationAddress,
    chainName,
    blockNumber,
  })

  return {
    address,
    chain,
    contract: { name: contract.name, verified: contract.isVerified },
    target: {
      address: target.address,
      name: target.name,
      verified: target.isVerified,
      file: Object.keys(sources).find(path => declares.test(sources[path])),
    },
    proxy,
    stats: {
      stateChanging: stateChanging.length,
      privilegedLooking: stateChanging.filter(fn => fn.name && looksPrivileged(fn.name)).length,
    },
    block: blockNumber.toString(),
    scannedAt: new Date().toISOString(),
    control,
    findings: [...findings, ...controlFindings(control, Boolean(proxy))].sort(compareFindings),
  }
}
