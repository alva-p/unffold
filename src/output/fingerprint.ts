import boxen from 'boxen'
import chalk from 'chalk'
import Table from 'cli-table3'
import { c } from './colors.js'
import { addressLink } from './links.js'
import type { ResolvedContract, ProxyInfo, DetectedStandards } from '../types.js'
import { standardsToLabels } from '../core/standards.js'

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function securityFlags(contract: ResolvedContract, proxy: ProxyInfo | null, standards: DetectedStandards): string {
  const flags: string[] = []
  if (proxy) flags.push(c.warn('⚠ upgradeable'))
  const src = contract.sourceCode || ''
  if (!src.includes('selfdestruct')) flags.push(c.success('✓ no selfdestruct'))
  else flags.push(c.danger('✗ selfdestruct'))
  if (!src.includes('tx.origin')) flags.push(c.success('✓ no tx.origin'))
  else flags.push(c.warn('⚠ tx.origin'))
  return flags.join('  ')
}

export function printFingerprint(
  contract: ResolvedContract,
  proxy: ProxyInfo | null,
  standards: DetectedStandards,
  chainName: string,
  explorerBase: string,
  balance?: bigint,
  totalSupply?: bigint
): void {
  const labels = standardsToLabels(standards)
  const labelStr = labels.map(l => c.address(`[${l}]`)).join(' ')
  const upgLabel = proxy ? c.warn('[Upgradeable]') : ''
  const verLabel = contract.isVerified ? c.success('[Verified]') : c.danger('[Unverified]')
  const badgesLine = [labelStr, upgLabel, verLabel].filter(Boolean).join(' ')

  // Header box
  const headerLines = [
    `${c.bold(contract.name)}  ${badgesLine}`,
    c.address(addressLink(contract.address, contract.address, explorerBase)),
  ]
  console.log(
    boxen(headerLines.join('\n'), {
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      borderStyle: 'single',
      borderColor: 'cyan',
    })
  )
  console.log()

  // Identity table
  const table = new Table({
    chars: {
      top: '', 'top-mid': '', 'top-left': '', 'top-right': '',
      bottom: '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': '',
      left: '', 'left-mid': '', mid: '', 'mid-mid': '',
      right: '', 'right-mid': '', middle: '  ',
    },
    style: { 'padding-left': 2, 'padding-right': 0, border: [], head: [] },
  })

  table.push([c.muted('address'), c.address(addressLink(contract.address, contract.address, explorerBase))])
  table.push([c.muted('network'), `${chainName}  (chain ${contract.chainId})`])
  if (contract.compilerVersion) {
    table.push([c.muted('compiler'), `Solidity ${contract.compilerVersion.split('+')[0]}`])
  }
  if (contract.license) {
    table.push([c.muted('license'), contract.license])
  }
  if (!contract.isVerified) {
    table.push([c.muted('source'), c.warn('unverified — no source code available')])
  }
  if (balance !== undefined) {
    const eth = Number(balance) / 1e18
    let balanceLine = `${eth.toFixed(4)} ETH`
    if (totalSupply !== undefined) {
      const supply = Number(totalSupply) / 1e18
      const supplyStr = supply >= 1e6
        ? `${(supply / 1e6).toFixed(2)}M`
        : supply.toLocaleString('en-US', { maximumFractionDigits: 2 })
      balanceLine += `  ${c.muted('· total supply')} ${supplyStr}`
    }
    table.push([c.muted('balance'), balanceLine])
  }

  console.log(table.toString())
  console.log()

  // Proxy info
  if (proxy) {
    console.log(`  ${c.muted('proxy')}     ${proxy.pattern}`)
    console.log(`  ${c.muted('impl')}      ${c.address(addressLink(shortAddr(proxy.implementationAddress), proxy.implementationAddress, explorerBase))}`)
    if (proxy.adminAddress) {
      console.log(`  ${c.muted('admin')}     ${c.address(addressLink(shortAddr(proxy.adminAddress), proxy.adminAddress, explorerBase))}`)
    }
    console.log(`  ${c.warn('⚠ upgradeable')}`)
    console.log()
  }

  // Standards
  if (labels.length > 0) {
    console.log(`  ${c.muted('standards')}  ${labels.map(l => c.success(l)).join('  ')}`)
    console.log()
  }

  // Security quick line
  const secLine = securityFlags(contract, proxy, standards)
  if (secLine) {
    console.log(`  ${secLine}`)
    console.log()
  }
}

export function printSimpleFingerprint(
  contract: ResolvedContract,
  proxy: ProxyInfo | null,
  standards: DetectedStandards,
  chainName: string,
  explorerBase: string,
  balance?: bigint,
  totalSupply?: bigint
): void {
  const labels = standardsToLabels(standards)
  const riskHints: string[] = []
  if (!contract.isVerified) riskHints.push('source not verified')
  if (proxy) riskHints.push(`upgradeable (${proxy.pattern})`)
  if (standards.ownable || standards.ownable2Step || standards.accessControl) riskHints.push('admin roles detected')
  if (standards.pausable) riskHints.push('pausable')

  const overall = !contract.isVerified || proxy || riskHints.length >= 2
    ? c.warn('review needed')
    : c.success('lower obvious risk')

  const table = new Table({
    chars: {
      top: '', 'top-mid': '', 'top-left': '', 'top-right': '',
      bottom: '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': '',
      left: '', 'left-mid': '', mid: '', 'mid-mid': '',
      right: '', 'right-mid': '', middle: '  ',
    },
    style: { 'padding-left': 2, 'padding-right': 0, border: [], head: [] },
  })

  table.push([c.muted('contract'), c.bold(contract.name)])
  table.push([c.muted('address'), c.address(addressLink(shortAddr(contract.address), contract.address, explorerBase))])
  table.push([c.muted('network'), chainName])
  table.push([c.muted('source'), contract.isVerified ? c.success('verified') : c.danger('unverified')])
  table.push([c.muted('type'), labels.length > 0 ? labels.join(', ') : 'unknown'])
  table.push([c.muted('proxy'), proxy ? c.warn(proxy.pattern) : c.success('not detected')])
  if (proxy) table.push([c.muted('implementation'), c.address(addressLink(shortAddr(proxy.implementationAddress), proxy.implementationAddress, explorerBase))])
  if (balance !== undefined) table.push([c.muted('balance'), `${(Number(balance) / 1e18).toFixed(4)} ETH`])
  if (totalSupply !== undefined) table.push([c.muted('total supply'), (Number(totalSupply) / 1e18).toLocaleString('en-US', { maximumFractionDigits: 2 })])
  table.push([c.muted('risk'), overall])
  table.push([c.muted('notes'), riskHints.length > 0 ? riskHints.join(', ') : 'no obvious red flags in quick scan'])

  console.log()
  console.log(`  ${c.bold('SIMPLE SUMMARY')}`)
  console.log(c.dim('  ──────────────────────────────────────────────────'))
  console.log(table.toString())
  console.log()
}
