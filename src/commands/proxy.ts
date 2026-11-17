import ora from 'ora'
import { analyzeProxyProfile } from '../core/profiles/proxy-profile.js'
import { c } from '../output/colors.js'
import { addressLink } from '../output/links.js'
import type { Config, ProxyInfo } from '../types.js'

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function linkedAddress(addr: string, explorerBase: string): string {
  return c.address(addressLink(shortAddr(addr), addr, explorerBase))
}

function printProxy(proxy: ProxyInfo, address: string, explorerBase: string): void {
  console.log(`  ${c.muted('pattern')}    ${proxy.pattern}`)
  console.log(`  ${c.muted('proxy')}      ${linkedAddress(address, explorerBase)}  (this contract)`)
  if (proxy.proxySlot) console.log(`  ${c.muted('impl slot')}  ${proxy.proxySlot.slice(0, 10)}...  ->  ${linkedAddress(proxy.implementationAddress, explorerBase)}`)
  else console.log(`  ${c.muted('impl')}       ${linkedAddress(proxy.implementationAddress, explorerBase)}`)
  if (proxy.adminAddress) console.log(`  ${c.muted('admin')}      ${linkedAddress(proxy.adminAddress, explorerBase)}`)
  if (proxy.chain) {
    console.log(`  ${c.muted('nested')}     ${proxy.chain.pattern}  ->  ${linkedAddress(proxy.chain.implementationAddress, explorerBase)}`)
  }
}

export async function runProxy(
  rawAddress: string,
  chainName: string,
  config: Config,
  rpcOverride?: string,
  jsonOutput = false
): Promise<void> {
  const spinner = jsonOutput ? null : ora({ text: `  Inspecting proxy for ${shortAddr(rawAddress)}...`, spinner: 'arc' }).start()

  try {
    const result = await analyzeProxyProfile(rawAddress, chainName, config, rpcOverride)
    const { report, proxy, history, historyAvailable } = result
    const address = report.address
    const risk = report.risk
    const explorerBase = report.links.find(link => link.label === 'Explorer')?.url.replace(address, '') ?? ''

    spinner?.stop()

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2))
      return
    }

    console.log()
    console.log(`  ${c.bold('PROXY ANALYSIS')}`)
    console.log(c.dim('  ──────────────────────────────────────────────────'))

    if (!proxy) {
      console.log(`  ${c.success('No proxy pattern detected.')}`)
      console.log()
      return
    }

    printProxy(proxy, address, explorerBase)

    console.log()
    console.log(`  ${c.bold('RISK SUMMARY')}`)
    console.log(`  ${c.muted('overall')}  ${risk.level === 'high' ? c.danger('high') : c.warn(risk.level)}`)
    console.log(`  ${c.muted('reason')}   ${risk.mainReason}`)

    console.log()
    console.log(`  ${c.bold('UPGRADE HISTORY')}`)
    if (!historyAvailable) {
      console.log(`  ${c.muted('Unavailable: the RPC limits log ranges. Add an Etherscan key (unffold config init) to load it.')}`)
    } else if (history.length === 0) {
      console.log(`  ${c.muted('No Upgraded(address) logs found from block 0.')}`)
    } else {
      for (const entry of history.slice(-8).reverse()) {
        console.log(`  ${c.muted(entry.blockNumber.padEnd(10))} ${linkedAddress(entry.address, explorerBase)}`)
      }
      if (history.length > 1) {
        const [previous, latest] = history.slice(-2)
        console.log(`  ${c.dim(`what changed in the last upgrade: unffold diff ${previous.address} ${latest.address} --chain ${chainName}`)}`)
      }
    }

    console.log()
    console.log(`  ${c.bold('PATTERNS CHECKED')}`)
    console.log(`  ${proxy.pattern.includes('EIP-1967') || proxy.pattern.includes('Transparent') ? c.success('✓') : c.muted('○')} EIP-1967 Transparent`)
    console.log(`  ${proxy.pattern.includes('UUPS') ? c.success('✓') : c.muted('○')} UUPS (EIP-1822)`)
    console.log(`  ${proxy.pattern.includes('Diamond') ? c.success('✓') : c.muted('○')} Diamond (EIP-2535)`)
    console.log(`  ${proxy.pattern.includes('Beacon') ? c.success('✓') : c.muted('○')} Beacon Proxy`)
    console.log(`  ${proxy.pattern.includes('Minimal') ? c.success('✓') : c.muted('○')} Minimal Proxy EIP-1167`)

    if (proxy.adminAddress) {
      console.log()
      console.log(`  ${c.warn('⚠')} ${c.muted('admin can upgrade without timelock')}`)
    }
    console.log()
  } catch (err) {
    spinner?.fail()
    throw err
  }
}
