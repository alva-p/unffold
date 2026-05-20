import ora from 'ora'
import { getAddress, isAddress } from 'viem'
import { createClient } from '../core/rpc.js'
import { resolveContract } from '../core/resolver.js'
import { resolveProxyChain } from '../core/proxy-detector.js'
import { detectStandards } from '../core/standards.js'
import { tryAnalyzeSource } from '../core/ast-analyzer.js'
import { c } from '../output/colors.js'
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

function validateAddress(raw: string): string {
  if (!isAddress(raw)) throw new Error(`Invalid EVM address: ${raw}`)
  return getAddress(raw)
}

function isStateChanging(item: AbiItem): boolean {
  return item.type === 'function' && item.stateMutability !== 'view' && item.stateMutability !== 'pure'
}

export async function runSecurity(
  rawAddress: string,
  chainName: string,
  config: Config,
  rpcOverride?: string,
  jsonOutput = false
): Promise<void> {
  const address = validateAddress(rawAddress)
  const spinner = jsonOutput ? null : ora({ text: `  Scanning security surface for ${c.address(address)}...`, spinner: 'dots' }).start()

  try {
    const client = createClient(chainName, config, rpcOverride)
    const contract = await resolveContract(address, chainName, config)
    const proxy = await resolveProxyChain(address, contract.abi, client)
    const standards = detectStandards(contract.abi || [], contract.sourceCode)
    const analysis = tryAnalyzeSource(contract.sourceCode)
    const source = contract.sourceCode || ''

    const stateChanging = (contract.abi || []).filter(isStateChanging)
    const modifierByFunction = new Map((analysis?.functions || []).map(fn => [fn.name, fn.modifiers]))
    const unprotected = stateChanging.filter(fn => {
      const modifiers = modifierByFunction.get(fn.name || '') || []
      return modifiers.length === 0 || !modifiers.some(mod => GUARD_MODIFIERS.includes(mod) || mod.startsWith('only'))
    })

    const result = {
      upgradeable: Boolean(proxy),
      selfdestruct: source.includes('selfdestruct'),
      txOrigin: source.includes('tx.origin'),
      delegatecall: source.includes('delegatecall'),
      reentrancyGuard: standards.reentrancyGuard,
      privilegedFunctions: stateChanging.length - unprotected.length,
      unprotectedFunctions: unprotected.map(fn => fn.name || '(fallback)'),
      proxy,
    }

    spinner?.stop()
    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2))
      return
    }

    console.log()
    console.log(`  ${c.bold('SECURITY SURFACE')}`)
    console.log(c.dim('  ──────────────────────────────────────────────────'))
    console.log(`  ${proxy ? c.warn('⚠ Upgradeable') : c.success('✓ Not upgradeable')}       ${proxy?.pattern || ''}`)
    console.log(`  ${result.selfdestruct ? c.danger('✗ selfdestruct') : c.success('✓ No selfdestruct')}`)
    console.log(`  ${result.txOrigin ? c.warn('⚠ tx.origin') : c.success('✓ No tx.origin')}`)
    console.log(`  ${result.delegatecall ? c.warn('⚠ delegatecall') : c.success('✓ No delegatecall marker')}`)
    console.log(`  ${result.reentrancyGuard ? c.success('✓ Reentrancy guards present') : c.muted('○ No nonReentrant marker')}`)

    console.log()
    console.log(`  ${c.bold('ACCESS CONTROL')}`)
    console.log(`  ${c.muted('state-changing fns')} ${stateChanging.length}`)
    console.log(`  ${c.muted('privileged fns')}     ${Math.max(result.privilegedFunctions, 0)}`)
    console.log(`  ${c.muted('unprotected fns')}    ${unprotected.length}`)
    if (unprotected.length > 0) {
      console.log(`  ${c.warn(unprotected.slice(0, 12).map(fn => fn.name || '(fallback)').join('  '))}`)
    }

    if (!analysis) {
      console.log()
      console.log(`  ${c.warn('Modifier analysis requires verified, parseable source code.')}`)
    }
    console.log()
  } catch (err) {
    spinner?.fail()
    console.error(`\n  ${c.danger('Error:')} ${(err as Error).message}\n`)
    process.exit(1)
  }
}
