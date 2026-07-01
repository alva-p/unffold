import ora from 'ora'
import Table from 'cli-table3'
import { getAddress, isAddress } from 'viem'
import { createClient, getChainConfig } from '../core/rpc.js'
import { resolveContract } from '../core/resolver.js'
import { resolveProxyChain } from '../core/proxy-detector.js'
import { detectStandards } from '../core/standards.js'
import { tryAnalyzeSource } from '../core/ast-analyzer.js'
import { c } from '../output/colors.js'
import { addressLink } from '../output/links.js'
import type { AbiItem, Config } from '../types.js'

const GUARD_MODIFIERS = [
  'onlyOwner',
  'onlyRole',
  'whenNotPaused',
  'nonReentrant',
  'auth',
  'requiresAuth',
  'restricted',
]

// Name patterns that suggest a function should have access control
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
  /^initialize$|^init$/,
]

function looksPrivileged(name: string): boolean {
  return PRIVILEGED_PATTERNS.some(p => p.test(name))
}

function validateAddress(raw: string): string {
  if (!isAddress(raw)) throw new Error(`Invalid EVM address: ${raw}`)
  return getAddress(raw)
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function isStateChanging(item: AbiItem): boolean {
  return item.type === 'function' && item.stateMutability !== 'view' && item.stateMutability !== 'pure'
}

function makeTable(): Table.Table {
  return new Table({
    chars: {
      top: '', 'top-mid': '', 'top-left': '', 'top-right': '',
      bottom: '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': '',
      left: '', 'left-mid': '', mid: '', 'mid-mid': '',
      right: '', 'right-mid': '', middle: '  ',
    },
    style: { 'padding-left': 2, 'padding-right': 0, border: [], head: [] },
    wordWrap: true,
  })
}

function severity(level: 'ok' | 'info' | 'medium' | 'high'): string {
  if (level === 'ok') return c.success('ok')
  if (level === 'info') return c.muted('info')
  if (level === 'medium') return c.warn('medium')
  return c.danger('high')
}

export async function runSecurity(
  rawAddress: string,
  chainName: string,
  config: Config,
  rpcOverride?: string,
  jsonOutput = false
): Promise<void> {
  const address = validateAddress(rawAddress)
  const spinner = jsonOutput ? null : ora({ text: `  Scanning security surface for ${shortAddr(address)}...`, spinner: 'arc' }).start()

  try {
    const chain = getChainConfig(chainName)
    const client = createClient(chainName, config, rpcOverride)
    const contract = await resolveContract(address, chainName, config)
    const proxy = await resolveProxyChain(address, contract.abi, client)
    const standards = detectStandards(contract.abi || [], contract.sourceCode)
    const analysis = tryAnalyzeSource(contract.sourceCode)
    const source = contract.sourceCode || ''

    const stateChanging = (contract.abi || []).filter(isStateChanging)
    const privilegedLooking = stateChanging.filter(fn => fn.name && looksPrivileged(fn.name))
    const modifierByFunction = new Map((analysis?.functions || []).map(fn => [fn.name, fn.modifiers]))
    const unprotected = analysis ? stateChanging.filter(fn => {
      const name = fn.name || ''
      // Skip functions not explicitly defined in this source (inherited — unknown modifier status)
      if (!modifierByFunction.has(name)) return false
      // Only flag functions whose names suggest they should be protected
      if (!looksPrivileged(name)) return false
      const modifiers = modifierByFunction.get(name) || []
      return modifiers.length === 0 || !modifiers.some(mod => GUARD_MODIFIERS.includes(mod) || mod.startsWith('only'))
    }) : []

    const result = {
      upgradeable: Boolean(proxy),
      selfdestruct: source.includes('selfdestruct'),
      txOrigin: source.includes('tx.origin'),
      delegatecall: source.includes('delegatecall'),
      reentrancyGuard: standards.reentrancyGuard,
      privilegedFunctions: privilegedLooking.length,
      unprotectedFunctions: unprotected.map(fn => fn.name || '(fallback)'),
      proxy,
    }

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2))
      return
    }

    spinner?.stop()

    console.log()
    console.log(`  ${c.bold('SECURITY SURFACE')}  ${c.address(addressLink(shortAddr(address), address, chain.explorerUrl))}  ${c.muted('[' + chainName + ']')}`)
    console.log(c.dim('  ──────────────────────────────────────────────────'))

    const surface = makeTable()
    surface.push([
      proxy ? severity(proxy.adminAddress ? 'high' : 'medium') : severity('ok'),
      'upgradeability',
      proxy ? `${proxy.pattern}${proxy.adminAddress ? ' with admin' : ''}` : 'not detected',
    ])
    surface.push([
      result.selfdestruct ? severity('high') : severity('ok'),
      'selfdestruct',
      result.selfdestruct ? 'source contains selfdestruct' : 'not detected',
    ])
    surface.push([
      result.txOrigin ? severity('medium') : severity('ok'),
      'tx.origin',
      result.txOrigin ? 'source checks transaction origin' : 'not detected',
    ])
    surface.push([
      result.delegatecall ? severity('medium') : severity('ok'),
      'delegatecall',
      result.delegatecall ? 'source can delegate execution' : 'not detected',
    ])
    surface.push([
      result.reentrancyGuard ? severity('ok') : severity('info'),
      'reentrancy guard',
      result.reentrancyGuard ? 'nonReentrant marker found' : 'not detected from ABI/source scan',
    ])
    console.log(surface.toString())

    console.log()
    console.log(`  ${c.bold('ACCESS CONTROL')}`)
    const access = makeTable()
    if (proxy?.adminAddress) {
      access.push([c.muted('proxy admin'), c.address(addressLink(shortAddr(proxy.adminAddress), proxy.adminAddress, chain.explorerUrl))])
    }
    const privilegedCount = Math.max(result.privilegedFunctions, 0)
    const privilegedNames = privilegedLooking
      .slice(0, 6)
      .map(fn => fn.name)
      .join(', ')
    access.push([c.muted('state-changing fns'), stateChanging.length])
    access.push([c.muted('privileged-looking fns'), `${privilegedCount}${privilegedNames ? `  ${c.dim('- ' + privilegedNames)}` : ''}`])
    access.push([c.muted('unprotected privileged fns'), unprotected.length > 0 ? c.warn(String(unprotected.length)) : c.success('0')])
    console.log(access.toString())

    if (unprotected.length > 0) {
      console.log()
      console.log(`  ${c.bold('UNPROTECTED PRIVILEGED FUNCTIONS')}`)
      console.log(`  ${c.warn(unprotected.slice(0, 12).map(fn => fn.name || '(fallback)').join('  '))}`)
    }

    if (!analysis) {
      console.log()
      console.log(`  ${c.muted('○ Modifier analysis unavailable — contract source not verified')}`)
    }
    console.log()
  } catch (err) {
    spinner?.fail()
    throw err
  }
}
