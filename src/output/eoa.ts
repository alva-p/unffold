import { formatEther } from 'viem'
import { c } from './colors.js'

export function printEoaInfo(
  address: string,
  chainName: string,
  balance?: bigint,
  transactionCount?: number
): void {
  console.log()
  console.log(`  ${c.bold('WALLET / EOA')}`)
  console.log(c.dim('  ──────────────────────────────────────────────────'))
  console.log(`  ${c.muted('address')}  ${c.address(address)}`)
  console.log(`  ${c.muted('network')}  ${chainName}`)
  if (balance !== undefined) console.log(`  ${c.muted('balance')}  ${formatEther(balance)} ETH`)
  if (transactionCount !== undefined) console.log(`  ${c.muted('nonce')}    ${transactionCount}`)
  console.log()
  console.log(`  ${c.warn('No contract bytecode found at this address.')}`)
  console.log()
}
