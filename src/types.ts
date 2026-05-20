export interface ResolvedContract {
  address: string
  chainId: number
  name: string
  sourceCode: string | null
  abi: AbiItem[] | null
  compilerVersion: string | null
  optimizationEnabled: boolean | null
  runs: number | null
  license: string | null
  isVerified: boolean
  isProxy: boolean
  implementationAddress: string | null
  implementationName: string | null
}

export interface AbiItem {
  type: string
  name?: string
  inputs?: AbiInput[]
  outputs?: AbiInput[]
  stateMutability?: string
}

export interface AbiInput {
  name: string
  type: string
  indexed?: boolean
  components?: AbiInput[]
}

export interface ProxyInfo {
  pattern: string
  implementationAddress: string
  adminAddress?: string
  proxySlot?: string
  depth: number
  chain?: ProxyInfo
}

export interface ChainConfig {
  name: string
  chainId: number
  explorerApiUrl: string
  rpcUrl: string
}

export interface Config {
  etherscanApiKey?: string
  defaultChain?: string
  rpcOverrides?: Record<string, string>
}

export interface DetectedStandards {
  erc20: boolean
  erc721: boolean
  erc1155: boolean
  erc4626: boolean
  erc2612: boolean
  erc4337: boolean
  ownable: boolean
  ownable2Step: boolean
  pausable: boolean
  accessControl: boolean
  reentrancyGuard: boolean
}

export interface ContractNode {
  name: string
  parents: string[]
}

export interface AnalyzedFunction {
  name: string
  visibility: string | null
  stateMutability: string | null
  modifiers: string[]
}

export interface AnalyzedEventInput {
  name: string
  type: string
  indexed: boolean
}

export interface AnalyzedEvent {
  name: string
  inputs: AnalyzedEventInput[]
}

export interface AnalyzedError {
  name: string
}

export interface AnalyzedStateVariable {
  name: string
  type: string
  visibility: string | null
  slot?: number
}

export interface AstAnalysis {
  inheritanceTree: ContractNode[]
  functions: AnalyzedFunction[]
  events: AnalyzedEvent[]
  errors: AnalyzedError[]
  stateVariables: AnalyzedStateVariable[]
  imports: string[]
}
