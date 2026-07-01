import { analyzeProfile } from '../../src/core/profile-runner.js'
import { analyzeGameProfile } from '../../src/core/profiles/game-profile.js'
import { analyzeNftProfile } from '../../src/core/profiles/nft-profile.js'
import { analyzeProxyProfile } from '../../src/core/profiles/proxy-profile.js'
import { analyzeTokenProfile } from '../../src/core/profiles/token-profile.js'
import { analyzeVaultProfile } from '../../src/core/profiles/vault-profile.js'
import { buildSecurityReport } from '../../src/core/security-report.js'
import { buildTraceReport } from '../../src/core/trace-report.js'
import type { ProfileFact, ProfileReport, ProfileWarning } from '../../src/core/profile-report.js'
import type { Config } from '../../src/types.js'

type StoredSettings = {
  etherscanApiKey?: string
  defaultChain?: string
  language?: Language
}

type Language = 'en' | 'es' | 'pt'
type AnalysisMode = 'analyze' | 'token' | 'nft' | 'proxy' | 'vault' | 'game' | 'security' | 'trace'

type ChromeStorage = {
  local: {
    get(keys: string[] | Record<string, unknown>, callback: (items: StoredSettings) => void): void
    set(items: StoredSettings, callback?: () => void): void
  }
}

type ChromeTab = {
  id?: number
  url?: string
}

type PageTargets = {
  addresses: string[]
  txs: string[]
}

declare const chrome: {
  storage: ChromeStorage
  tabs: {
    query(queryInfo: { active: boolean; currentWindow: boolean }, callback: (tabs: ChromeTab[]) => void): void
  }
  scripting: {
    executeScript<T>(injection: { target: { tabId: number }; func: () => T }): Promise<Array<{ result?: T }>>
  }
}

const settingsForm = document.querySelector<HTMLFormElement>('#settingsForm')!
const scanForm = document.querySelector<HTMLFormElement>('#scanForm')!
const setupPanel = document.querySelector<HTMLElement>('#setupPanel')!
const apiKeyInput = document.querySelector<HTMLInputElement>('#apiKey')!
const addressInput = document.querySelector<HTMLInputElement>('#address')!
const chainSelect = document.querySelector<HTMLSelectElement>('#chain')!
const languageSelect = document.querySelector<HTMLSelectElement>('#language')!
const scanButton = document.querySelector<HTMLButtonElement>('#scanButton')!
const modeButtons = document.querySelector<HTMLElement>('#modeButtons')!
const detectedPanel = document.querySelector<HTMLElement>('#detectedPanel')!
const detectedAddresses = document.querySelector<HTMLElement>('#detectedAddresses')!
const refreshPageScan = document.querySelector<HTMLButtonElement>('#refreshPageScan')!
const errorPanel = document.querySelector<HTMLElement>('#errorPanel')!
const errorTitle = document.querySelector<HTMLElement>('#errorTitle')!
const errorMessage = document.querySelector<HTMLElement>('#errorMessage')!
const errorHint = document.querySelector<HTMLElement>('#errorHint')!
const retryButton = document.querySelector<HTMLButtonElement>('#retryButton')!
const statusText = document.querySelector<HTMLElement>('#statusText')!
const keyState = document.querySelector<HTMLButtonElement>('#keyState')!
const resultPanel = document.querySelector<HTMLElement>('#resultPanel')!
const profileBadge = document.querySelector<HTMLElement>('#profileBadge')!
const reportTitle = document.querySelector<HTMLElement>('#reportTitle')!
const reportSubtitle = document.querySelector<HTMLElement>('#reportSubtitle')!
const riskPill = document.querySelector<HTMLElement>('#riskPill')!
const riskSummary = document.querySelector<HTMLElement>('#riskSummary')!
const nftPreview = document.querySelector<HTMLElement>('#nftPreview')!
const nftPreviewImage = document.querySelector<HTMLImageElement>('#nftPreviewImage')!
const badges = document.querySelector<HTMLElement>('#badges')!
const checklist = document.querySelector<HTMLElement>('#checklist')!
const facts = document.querySelector<HTMLElement>('#facts')!
const warnings = document.querySelector<HTMLElement>('#warnings')!
const copySummary = document.querySelector<HTMLButtonElement>('#copySummary')!
const explorerLink = document.querySelector<HTMLAnchorElement>('#explorerLink')!
const metadataLink = document.querySelector<HTMLAnchorElement>('#metadataLink')!

const labels = {
  en: {
    ready: 'Ready',
    settings: 'Settings',
    noKey: 'No key',
    keySaved: 'Key saved',
    pasteKey: 'Paste an API key first',
    saveKey: 'Save an API key first',
    analyzing: 'Analyzing...',
    detected: 'Detected',
    copied: 'Summary copied',
    settingsTitle: 'Settings',
    apiKeyLink: 'Get your Etherscan API key here',
    apiKeyLabel: 'API key',
    apiKeyPlaceholder: 'Paste your Etherscan key',
    chainLabel: 'Default network',
    languageLabel: 'Language',
    saveSettings: 'Save settings',
    addressLabel: 'Address',
    addressPlaceholder: '0x... paste contract or tx',
    analyze: 'Analyze',
    foundTitle: 'Found on this page',
    refresh: 'Refresh',
    checklistTitle: 'What to check before interacting',
    factsTitle: 'Facts',
    warningsTitle: 'Warnings',
    copySummary: 'Copy summary',
    openExplorer: 'Open explorer',
    openMetadata: 'Open metadata',
    couldNotAnalyze: 'Could not analyze',
    tryAgain: 'Try again',
    invalidInput: 'Invalid address or transaction hash.',
    invalidInputHint: 'Paste a 0x contract address or a 0x transaction hash.',
    apiKeyHint: 'Check your API key in Settings.',
    networkHint: 'Check that the selected network matches this address or transaction.',
    timeoutHint: 'The RPC or explorer request timed out. Try again or switch network.',
    genericHint: 'Check the address, network, and API key, then try again.',
    noWarnings: 'No high or medium warnings.',
    noFacts: 'No facts available.',
    defaultChecklist: 'No high or medium warnings were detected. Still verify the address, chain, and official project links before interacting.',
    noWarningsCopy: '- No high or medium warnings detected.',
    risk: 'Risk',
    whatToCheck: 'What to check:',
    highRisk: 'High risk',
    reviewNeeded: 'Review needed',
    looksSafer: 'Looks safer',
  },
  es: {
    ready: 'Listo',
    settings: 'Ajustes',
    noKey: 'Sin key',
    keySaved: 'Key guardada',
    pasteKey: 'Pegá una API key primero',
    saveKey: 'Guardá una API key primero',
    analyzing: 'Analizando...',
    detected: 'Detectado',
    copied: 'Resumen copiado',
    settingsTitle: 'Ajustes',
    apiKeyLink: 'Conseguí tu API key de Etherscan acá',
    apiKeyLabel: 'API key',
    apiKeyPlaceholder: 'Pegá tu key de Etherscan',
    chainLabel: 'Red por defecto',
    languageLabel: 'Idioma',
    saveSettings: 'Guardar ajustes',
    addressLabel: 'Address',
    addressPlaceholder: '0x... pegá contrato o tx',
    analyze: 'Analizar',
    foundTitle: 'Encontradas en esta página',
    refresh: 'Actualizar',
    checklistTitle: 'Qué revisar antes de interactuar',
    factsTitle: 'Datos',
    warningsTitle: 'Alertas',
    copySummary: 'Copiar resumen',
    openExplorer: 'Abrir explorer',
    openMetadata: 'Abrir metadata',
    couldNotAnalyze: 'No se pudo analizar',
    tryAgain: 'Reintentar',
    invalidInput: 'Address o transaction hash inválido.',
    invalidInputHint: 'Pegá una address 0x de contrato o una transaction hash 0x.',
    apiKeyHint: 'Revisá tu API key en Ajustes.',
    networkHint: 'Revisá que la red seleccionada coincida con esta address o transacción.',
    timeoutHint: 'El RPC o explorer tardó demasiado. Reintentá o cambiá de red.',
    genericHint: 'Revisá address, red y API key, y reintentá.',
    noWarnings: 'No hay alertas medias o altas.',
    noFacts: 'No hay datos disponibles.',
    defaultChecklist: 'No se detectaron alertas medias o altas. Igual verificá la address, la red y los links oficiales antes de interactuar.',
    noWarningsCopy: '- No se detectaron alertas medias o altas.',
    risk: 'Riesgo',
    whatToCheck: 'Qué revisar:',
    highRisk: 'Riesgo alto',
    reviewNeeded: 'Revisar',
    looksSafer: 'Se ve mejor',
  },
  pt: {
    ready: 'Pronto',
    settings: 'Ajustes',
    noKey: 'Sem key',
    keySaved: 'Key salva',
    pasteKey: 'Cole uma API key primeiro',
    saveKey: 'Salve uma API key primeiro',
    analyzing: 'Analisando...',
    detected: 'Detectado',
    copied: 'Resumo copiado',
    settingsTitle: 'Ajustes',
    apiKeyLink: 'Pegue sua API key da Etherscan aqui',
    apiKeyLabel: 'API key',
    apiKeyPlaceholder: 'Cole sua key da Etherscan',
    chainLabel: 'Rede padrão',
    languageLabel: 'Idioma',
    saveSettings: 'Salvar ajustes',
    addressLabel: 'Address',
    addressPlaceholder: '0x... cole contrato ou tx',
    analyze: 'Analisar',
    foundTitle: 'Encontradas nesta página',
    refresh: 'Atualizar',
    checklistTitle: 'O que verificar antes de interagir',
    factsTitle: 'Dados',
    warningsTitle: 'Alertas',
    copySummary: 'Copiar resumo',
    openExplorer: 'Abrir explorer',
    openMetadata: 'Abrir metadata',
    couldNotAnalyze: 'Não foi possível analisar',
    tryAgain: 'Tentar novamente',
    invalidInput: 'Address ou transaction hash inválido.',
    invalidInputHint: 'Cole um address 0x de contrato ou uma transaction hash 0x.',
    apiKeyHint: 'Verifique sua API key em Ajustes.',
    networkHint: 'Verifique se a rede selecionada corresponde a este address ou transação.',
    timeoutHint: 'O RPC ou explorer demorou demais. Tente novamente ou troque a rede.',
    genericHint: 'Verifique address, rede e API key, e tente novamente.',
    noWarnings: 'Nenhum alerta médio ou alto.',
    noFacts: 'Nenhum dado disponível.',
    defaultChecklist: 'Nenhum alerta médio ou alto foi detectado. Mesmo assim, verifique o address, a rede e os links oficiais antes de interagir.',
    noWarningsCopy: '- Nenhum alerta médio ou alto detectado.',
    risk: 'Risco',
    whatToCheck: 'O que verificar:',
    highRisk: 'Risco alto',
    reviewNeeded: 'Revisar',
    looksSafer: 'Parece melhor',
  },
} satisfies Record<Language, Record<string, string>>

let settings: StoredSettings = {}
let currentReport: ProfileReport | null = null
let selectedMode: AnalysisMode = 'analyze'

const modes: Array<{ mode: AnalysisMode; label: string }> = [
  { mode: 'analyze', label: 'Analyze' },
  { mode: 'token', label: 'Token' },
  { mode: 'nft', label: 'NFT' },
  { mode: 'proxy', label: 'Proxy' },
  { mode: 'vault', label: 'Vault' },
  { mode: 'game', label: 'Game' },
  { mode: 'security', label: 'Security' },
]

const traceMode = [{ mode: 'trace' as const, label: 'Trace' }]

function t(key: keyof typeof labels.en): string {
  return labels[settings.language ?? 'en'][key]
}

function getStoredSettings(): Promise<StoredSettings> {
  return new Promise(resolve => {
    chrome.storage.local.get(['etherscanApiKey', 'defaultChain', 'language'], resolve)
  })
}

function setStoredSettings(next: StoredSettings): Promise<void> {
  return new Promise(resolve => {
    chrome.storage.local.set(next, resolve)
  })
}

function setStatus(message: string): void {
  statusText.textContent = message
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function isTxHash(value: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(value)
}

function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value)
}

function chainFromUrl(url?: string): string | null {
  if (!url) return null
  let host = ''
  try {
    host = new URL(url).host
  } catch {
    return null
  }
  if (host === 'etherscan.io') return 'mainnet'
  if (host === 'basescan.org') return 'base'
  if (host === 'bscscan.com') return 'bsc'
  if (host === 'app.roninchain.com') return 'ronin'
  if (host === 'abscan.org') return 'abstract'
  if (host === 'arbiscan.io') return 'arbitrum'
  if (host === 'optimistic.etherscan.io') return 'optimism'
  if (host === 'polygonscan.com') return 'polygon'
  if (host === 'explorer.zksync.io') return 'zksync'
  if (host === 'sepolia.etherscan.io') return 'sepolia'
  if (host === 'holesky.etherscan.io') return 'holesky'
  return null
}

function syncSettingsState(keepPanel = false): void {
  const hasKey = Boolean(settings.etherscanApiKey)
  const chain = settings.defaultChain ?? 'mainnet'
  const language = settings.language ?? 'en'
  keyState.textContent = hasKey ? t('settings') : t('noKey')
  keyState.classList.toggle('ready', hasKey)
  if (!keepPanel) setupPanel.hidden = hasKey
  scanButton.disabled = !hasKey
  chainSelect.value = chain
  languageSelect.value = language
  document.documentElement.lang = language
  document.querySelector('#settingsTitle')!.textContent = t('settingsTitle')
  document.querySelector('#apiKeyLink')!.textContent = t('apiKeyLink')
  document.querySelector('#apiKeyLabel')!.textContent = t('apiKeyLabel')
  apiKeyInput.placeholder = t('apiKeyPlaceholder')
  document.querySelector('#chainLabel')!.textContent = t('chainLabel')
  document.querySelector('#languageLabel')!.textContent = t('languageLabel')
  document.querySelector('#saveSettings')!.textContent = t('saveSettings')
  document.querySelector('#addressLabel')!.textContent = t('addressLabel')
  addressInput.placeholder = t('addressPlaceholder')
  scanButton.textContent = t('analyze')
  document.querySelector('#foundTitle')!.textContent = t('foundTitle')
  refreshPageScan.textContent = t('refresh')
  document.querySelector('#checklistTitle')!.textContent = t('checklistTitle')
  document.querySelector('#factsTitle')!.textContent = t('factsTitle')
  document.querySelector('#warningsTitle')!.textContent = t('warningsTitle')
  copySummary.textContent = t('copySummary')
  explorerLink.textContent = t('openExplorer')
  metadataLink.textContent = t('openMetadata')
  errorTitle.textContent = t('couldNotAnalyze')
  retryButton.textContent = t('tryAgain')
  renderModeButtons()
}

function errorHintFor(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes('api key') || lower.includes('apikey') || lower.includes('unauthorized')) return t('apiKeyHint')
  if (lower.includes('unsupported chain') || lower.includes('network') || lower.includes('chain') || lower.includes('not found')) return t('networkHint')
  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('failed to fetch') || lower.includes('fetch')) return t('timeoutHint')
  return t('genericHint')
}

function showError(message: string, hint = errorHintFor(message)): void {
  currentReport = null
  resultPanel.hidden = true
  errorMessage.textContent = message
  errorHint.textContent = hint
  errorPanel.hidden = false
  setStatus(t('couldNotAnalyze'))
}

function clearError(): void {
  errorPanel.hidden = true
  errorMessage.textContent = ''
  errorHint.textContent = ''
}

function normalizeMediaUri(uri: unknown): string | null {
  if (typeof uri !== 'string' || !uri) return null
  if (uri.startsWith('ipfs://ipfs/')) return `https://ipfs.io/ipfs/${uri.slice('ipfs://ipfs/'.length)}`
  if (uri.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${uri.slice('ipfs://'.length)}`
  if (uri.startsWith('ar://')) return `https://arweave.net/${uri.slice('ar://'.length)}`
  if (uri.startsWith('http://') || uri.startsWith('https://') || uri.startsWith('data:image/')) return uri
  return null
}

function parseDataJson(uri: string): { image?: unknown; image_url?: unknown } | null {
  if (!uri.startsWith('data:application/json')) return null
  const comma = uri.indexOf(',')
  if (comma === -1) return null
  const payload = uri.slice(comma + 1)
  try {
    const text = uri.slice(0, comma).includes(';base64') ? atob(payload) : decodeURIComponent(payload)
    return JSON.parse(text) as { image?: unknown; image_url?: unknown }
  } catch {
    return null
  }
}

async function renderNftPreview(metadataUrl?: string): Promise<void> {
  nftPreview.hidden = true
  nftPreviewImage.removeAttribute('src')
  if (!metadataUrl) return

  try {
    const embedded = parseDataJson(metadataUrl)
    const metadata = embedded ?? await fetch(metadataUrl).then(response => response.ok ? response.json() : null) as { image?: unknown; image_url?: unknown } | null
    if (!metadata) return
    const image = normalizeMediaUri(metadata.image ?? metadata.image_url)
    if (!image) return
    nftPreviewImage.src = image
    nftPreview.hidden = false
  } catch {
    // Metadata preview is best-effort.
  }
}

function renderModeButtons(activeProfile?: string): void {
  const items = isTxHash(addressInput.value.trim()) ? traceMode : modes
  if (items === traceMode && selectedMode !== 'trace') selectedMode = 'trace'
  if (items === modes && selectedMode === 'trace') selectedMode = 'analyze'

  modeButtons.replaceChildren(...items.map(item => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'modeButton'
    const active = item.mode === selectedMode || item.mode === activeProfile
    button.classList.toggle('active', active)
    button.textContent = item.label
    button.addEventListener('click', () => {
      selectedMode = item.mode
      renderModeButtons()
      if (addressInput.value.trim()) void scanAddress()
    })
    return button
  }))
}

function renderBadges(values: string[]): void {
  badges.replaceChildren(...values.map(value => {
    const item = document.createElement('span')
    item.textContent = value
    return item
  }))
}

function renderFacts(values: ProfileFact[]): void {
  const visible = values.filter(fact => fact.value !== null && fact.value !== '')
  if (visible.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'empty'
    empty.textContent = t('noFacts')
    facts.replaceChildren(empty)
    return
  }

  facts.replaceChildren(...visible.map(fact => {
    const row = document.createElement('div')
    row.className = 'fact'

    const term = document.createElement('dt')
    term.textContent = fact.label

    const detail = document.createElement('dd')
    const raw = String(fact.value)
    detail.textContent = raw.length > 130 ? `${raw.slice(0, 127)}...` : raw
    if (raw.length > 130) detail.title = raw

    row.append(term, detail)
    return row
  }))
}

function renderWarnings(values: ProfileWarning[]): void {
  if (values.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'empty'
    empty.textContent = t('noWarnings')
    warnings.replaceChildren(empty)
    return
  }

  warnings.replaceChildren(...values.map(warning => {
    const item = document.createElement('details')
    item.className = `warning ${warning.severity}`

    const header = document.createElement('summary')

    const title = document.createElement('strong')
    title.textContent = warning.title

    const severity = document.createElement('span')
    severity.textContent = warning.severity

    const body = document.createElement('p')
    body.textContent = warning.body

    const recommendation = document.createElement('p')
    recommendation.className = 'recommendation'
    recommendation.textContent = warning.recommendation

    header.append(title, severity)
    item.append(header, body, recommendation)
    return item
  }))
}

function renderChecklist(values: ProfileWarning[]): void {
  const items = values.length > 0
    ? values.slice(0, 5).map(warning => warning.recommendation)
    : [t('defaultChecklist')]

  checklist.replaceChildren(...items.map(text => {
    const item = document.createElement('li')
    item.textContent = text
    return item
  }))
}

function riskCopy(level: ProfileReport['risk']['level']): string {
  if (level === 'high') return t('highRisk')
  if (level === 'medium') return t('reviewNeeded')
  return t('looksSafer')
}

function summaryText(report: ProfileReport): string {
  const warningLines = report.warnings.length > 0
    ? report.warnings.slice(0, 5).map(warning => `- ${warning.title}: ${warning.recommendation}`).join('\n')
    : t('noWarningsCopy')

  return [
    `${report.title} (${report.profile})`,
    `${report.subtitle}`,
    `${t('risk')}: ${riskCopy(report.risk.level)}`,
    report.risk.summary,
    '',
    t('whatToCheck'),
    warningLines,
    '',
    report.links.find(link => link.label === 'Explorer')?.url ?? report.address,
  ].join('\n')
}

function renderReport(report: ProfileReport): void {
  currentReport = report
  clearError()
  if (selectedMode === 'analyze' && modes.some(item => item.mode === report.profile)) {
    renderModeButtons(report.profile)
  }
  profileBadge.textContent = report.profile
  reportTitle.textContent = report.title
  reportSubtitle.textContent = report.subtitle
  riskPill.textContent = riskCopy(report.risk.level)
  riskPill.className = `riskPill ${report.risk.level}`
  riskSummary.textContent = report.risk.summary
  renderBadges(report.badges)
  renderChecklist(report.warnings)
  renderFacts(report.facts)
  renderWarnings(report.warnings)

  const explorer = report.links.find(link => link.label === 'Explorer') ?? report.links[0]
  const metadata = report.links.find(link => link.label === 'NFT metadata')
  explorerLink.href = explorer?.url ?? '#'
  metadataLink.href = metadata?.url ?? '#'
  metadataLink.hidden = !metadata
  void renderNftPreview(metadata?.url)
  resultPanel.hidden = false
}

async function runSelectedAnalysis(address: string, chain: string, config: Config): Promise<ProfileReport> {
  if (selectedMode === 'trace') return buildTraceReport(address, chain, config)
  if (selectedMode === 'token') return (await analyzeTokenProfile(address, chain, config)).report
  if (selectedMode === 'nft') return (await analyzeNftProfile(address, chain, config)).report
  if (selectedMode === 'proxy') return (await analyzeProxyProfile(address, chain, config)).report
  if (selectedMode === 'vault') return (await analyzeVaultProfile(address, chain, config)).report
  if (selectedMode === 'game') return (await analyzeGameProfile(address, chain, config)).report
  if (selectedMode === 'security') return buildSecurityReport(address, chain, config)
  return (await analyzeProfile(address, chain, config)).report
}

function extractTargetsFromPage(): PageTargets {
  const linkText = Array.from(document.links).map(link => `${link.href} ${link.textContent ?? ''}`)
  const text = [document.body?.innerText ?? '', ...linkText].join('\n')
  const txs = Array.from(new Set(text.match(/0x[a-fA-F0-9]{64}/g) ?? [])).slice(0, 6)
  const addresses = Array.from(new Set(text.match(/0x[a-fA-F0-9]{40}/g) ?? [])).slice(0, 12)
  return { addresses, txs }
}

function getActiveTab(): Promise<ChromeTab | null> {
  return new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => resolve(tabs[0] ?? null))
  })
}

async function findPageTargets(): Promise<PageTargets> {
  const tab = await getActiveTab()
  if (!tab?.id || tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) return { addresses: [], txs: [] }

  const detectedChain = chainFromUrl(tab.url)
  if (detectedChain && detectedChain !== settings.defaultChain) {
    settings = { ...settings, defaultChain: detectedChain }
    chainSelect.value = detectedChain
    await setStoredSettings(settings)
  }

  const results = await chrome.scripting.executeScript<PageTargets>({
    target: { tabId: tab.id },
    func: extractTargetsFromPage,
  })

  return results[0]?.result ?? { addresses: [], txs: [] }
}

function renderDetectedTargets(targets: PageTargets): void {
  const values = [
    ...targets.txs.map(value => ({ value, label: shortAddress(value), mode: 'trace' as AnalysisMode })),
    ...targets.addresses.map(value => ({ value, label: shortAddress(value), mode: 'analyze' as AnalysisMode })),
  ]
  detectedPanel.hidden = values.length === 0
  detectedAddresses.replaceChildren(...values.map(target => {
    const button = document.createElement('button')
    button.className = 'addressButton'
    button.type = 'button'
    button.textContent = target.mode === 'trace' ? `tx ${target.label}` : target.label
    button.title = target.value
    button.addEventListener('click', () => {
      selectedMode = target.mode
      addressInput.value = target.value
      renderModeButtons()
      void scanAddress()
    })
    return button
  }))
}

async function scanCurrentPage(): Promise<void> {
  try {
    renderDetectedTargets(await findPageTargets())
  } catch {
    renderDetectedTargets({ addresses: [], txs: [] })
  }
}

async function scanAddress(): Promise<void> {
  if (!settings.etherscanApiKey) {
    setStatus(t('saveKey'))
    return
  }

  const address = addressInput.value.trim()
  if (!isAddress(address) && !isTxHash(address)) {
    showError(t('invalidInput'), t('invalidInputHint'))
    return
  }
  renderModeButtons()
  const chain = settings.defaultChain ?? 'mainnet'
  const config: Config = { etherscanApiKey: settings.etherscanApiKey, defaultChain: chain }

  scanButton.disabled = true
  clearError()
  setStatus(t('analyzing'))

  try {
    const report = await runSelectedAnalysis(address, chain, config)
    renderReport(report)
    setStatus(`${t('detected')} ${report.profile}`)
  } catch (error) {
    showError((error as Error).message)
  } finally {
    scanButton.disabled = !settings.etherscanApiKey
  }
}

async function loadSettings(): Promise<void> {
  settings = { defaultChain: 'mainnet', language: 'en', ...await getStoredSettings() }
  syncSettingsState()
  setStatus(t('ready'))
  await scanCurrentPage()
}

settingsForm.addEventListener('submit', async event => {
  event.preventDefault()
  const apiKey = apiKeyInput.value.trim()
  if (!apiKey && !settings.etherscanApiKey) {
    setStatus(t('pasteKey'))
    return
  }

  settings = {
    ...settings,
    etherscanApiKey: apiKey || settings.etherscanApiKey,
    defaultChain: chainSelect.value || 'mainnet',
    language: languageSelect.value as Language,
  }
  await setStoredSettings(settings)
  apiKeyInput.value = ''
  syncSettingsState()
  setStatus(t('keySaved'))
})

addressInput.addEventListener('input', () => {
  renderModeButtons()
})

keyState.addEventListener('click', () => {
  setupPanel.hidden = !setupPanel.hidden
  if (!setupPanel.hidden) apiKeyInput.focus()
})

chainSelect.addEventListener('change', async () => {
  settings = { ...settings, defaultChain: chainSelect.value || 'mainnet' }
  await setStoredSettings(settings)
})

languageSelect.addEventListener('change', async () => {
  settings = { ...settings, language: languageSelect.value as Language }
  await setStoredSettings(settings)
  syncSettingsState(true)
})

refreshPageScan.addEventListener('click', () => {
  void scanCurrentPage()
})

retryButton.addEventListener('click', () => {
  void scanAddress()
})

copySummary.addEventListener('click', async () => {
  if (!currentReport) return
  await navigator.clipboard.writeText(summaryText(currentReport))
  setStatus(t('copied'))
})

scanForm.addEventListener('submit', event => {
  event.preventDefault()
  void scanAddress()
})

void loadSettings()
