import boxen from 'boxen'
import chalk from 'chalk'
import Table from 'cli-table3'
import { c } from './colors.js'
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
  balance?: bigint
): void {
  const labels = standardsToLabels(standards)
  const labelStr = labels.map(l => c.address(`[${l}]`)).join(' ')
  const upgLabel = proxy ? c.warn('[Upgradeable]') : ''
  const verLabel = contract.isVerified ? c.success('[Verified]') : c.danger('[Unverified]')
  const badgesLine = [labelStr, upgLabel, verLabel].filter(Boolean).join(' ')

  // Header box
  const headerLines = [
    `${c.bold(contract.name)}  ${badgesLine}`,
    c.address(contract.address),
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
    table.push([c.muted('balance'), `${eth.toFixed(4)} ETH`])
  }

  console.log(table.toString())
  console.log()

  // Proxy info
  if (proxy) {
    console.log(`  ${c.muted('proxy')}     ${proxy.pattern}`)
    console.log(`  ${c.muted('impl')}      ${c.address(shortAddr(proxy.implementationAddress))}`)
    if (proxy.adminAddress) {
      console.log(`  ${c.muted('admin')}     ${c.address(shortAddr(proxy.adminAddress))}`)
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
