import type { AbiItem, DetectedStandards } from '../types.js'

function hasFn(abi: AbiItem[], name: string, inputCount?: number): boolean {
  return abi.some(item => {
    if (item.type !== 'function' || item.name !== name) return false
    if (inputCount !== undefined && item.inputs?.length !== inputCount) return false
    return true
  })
}

export function detectStandards(abi: AbiItem[], sourceCode?: string | null): DetectedStandards {
  const has = (name: string, inputCount?: number) => hasFn(abi, name, inputCount)

  return {
    erc20:
      has('transfer') &&
      has('approve') &&
      has('allowance') &&
      has('balanceOf') &&
      has('totalSupply'),

    erc721:
      has('ownerOf') &&
      has('safeTransferFrom', 4),

    erc1155:
      has('balanceOfBatch') &&
      has('safeTransferFrom', 5),

    erc4626:
      has('deposit') &&
      has('withdraw') &&
      has('convertToAssets') &&
      has('convertToShares'),

    erc2612:
      abi.some(
        item =>
          item.type === 'function' &&
          item.name === 'permit' &&
          item.inputs?.length === 7
      ),

    erc4337: has('validateUserOp'),

    ownable: has('owner') && has('transferOwnership'),

    ownable2Step: has('pendingOwner') && has('acceptOwnership'),

    pausable: has('paused') && has('pause') && has('unpause'),

    accessControl: has('hasRole') && has('grantRole') && has('revokeRole'),

    reentrancyGuard: sourceCode ? sourceCode.includes('nonReentrant') : false,
  }
}

export function standardsToLabels(s: DetectedStandards): string[] {
  const labels: string[] = []
  if (s.erc20) labels.push('ERC-20')
  if (s.erc721) labels.push('ERC-721')
  if (s.erc1155) labels.push('ERC-1155')
  if (s.erc4626) labels.push('ERC-4626')
  if (s.erc2612) labels.push('ERC-2612')
  if (s.erc4337) labels.push('ERC-4337')
  if (s.ownable2Step) labels.push('Ownable2Step')
  else if (s.ownable) labels.push('Ownable')
  if (s.pausable) labels.push('Pausable')
  if (s.accessControl) labels.push('AccessControl')
  if (s.reentrancyGuard) labels.push('ReentrancyGuard')
  return labels
}
