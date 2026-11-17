import type { ProfileWarning } from './profile-report.js'

// Spanish / Portuguese text for warnings, keyed by warning id. The core emits English; the popup swaps
// in these texts and keeps the dynamic parts (Contract.function, file, addresses) from the original.
// Unknown ids stay in English. Placeholders: {symbol} {issuer} {address}.

type Lang = 'es' | 'pt'
type Text = { title: string; body: string; todo: string; fp?: string }

const ES: Record<string, Text> = {
  'upgradeable': { title: 'Contrato actualizable (proxy)', body: 'Quien controle los upgrades puede reemplazar la lógica después de que deposites o apruebes.', todo: 'Revisá quién controla los upgrades: multisig, timelock, gobernanza o una sola clave.', fp: 'Es normal en muchos protocolos; el riesgo depende de quién controla el upgrade.' },
  'single-key-control': { title: 'Una sola clave puede actualizar este contrato sin demora', body: 'Quien tenga esa clave puede cambiar el comportamiento del contrato al instante, sin tiempo para que los usuarios salgan.', todo: 'Averiguá quién tiene esa clave y si el equipo se comprometió a usar multisig o timelock.', fp: 'Claves en custodia MPC o hardware se ven como una sola EOA on-chain.' },
  'single-key-control:owner': { title: 'Una sola clave administra este contrato sin demora', body: 'Quien tenga esa clave puede cambiar parámetros o permisos al instante.', todo: 'Averiguá quién tiene esa clave y si el equipo se comprometió a usar multisig o timelock.', fp: 'Claves en custodia MPC o hardware se ven como una sola EOA on-chain.' },
  'unprotected-privileged': { title: 'Función de admin sin control de acceso', body: 'Cambia estado, no tiene modificador de acceso y nunca revisa msg.sender: cualquiera podría llamarla.', todo: 'Confirmá si realmente cualquiera debería poder llamarla.', fp: 'Heurística por nombre: puede ser pública a propósito o el chequeo vive en un helper con nombre inusual.' },
  'unprotected-initializer': { title: 'Inicializador sin protección', body: 'Se puede llamar desde afuera sin modificador initializer ni chequeo de quién llama: alguien podría reinicializar y quedarse con el owner.', todo: 'Verificá que solo pueda correr una vez y que el proxy se haya inicializado en el mismo deploy.', fp: 'Guardas de una sola vez con nombres que el chequeo no reconoce.' },
  'uups-unprotected-upgrade': { title: 'Upgrade UUPS sin chequeo de quién llama', body: '_authorizeUpgrade no tiene control de acceso reconocido: cualquiera podría llamar upgradeToAndCall y reemplazar la lógica.', todo: 'Confirmá que solo un owner, rol o timelock de confianza pueda pasar este chequeo.', fp: 'El chequeo vive en un modificador o helper con nombre no reconocido.' },
  'uups-no-upgrade-function': { title: 'Implementación UUPS sin upgradeTo / upgradeToAndCall', body: 'En UUPS la función de upgrade vive en la implementación. Sin ella el proxy queda congelado, incluso para un arreglo de emergencia.', todo: 'Confirmá si congelar los upgrades fue intencional y cómo se arreglarían bugs.', fp: 'El equipo lo congeló a propósito o la función tiene un nombre no estándar.' },
  'uninitialized-instance': { title: 'El contrato no está inicializado', body: 'El slot Initializable de OpenZeppelin v5 vale 0: initialize() todavía lo puede llamar cualquiera, y quien lo haga primero queda como owner.', todo: 'Volvé a leer el slot de la evidencia con cast storage.', fp: 'Se dejó sin inicializar a propósito hasta una transacción controlada.' },
  'uninitialized-implementation': { title: 'Implementación sin inicializar y con initializers habilitados', body: 'Cualquiera puede inicializar la implementación y quedarse con ella. Es grave si desde ahí se alcanza delegatecall o selfdestruct.', todo: 'Volvé a leer el slot en la dirección de la implementación (ver evidencia).', fp: 'La implementación no tiene lógica privilegiada alcanzable tras inicializar.' },
  'initializers-not-disabled': { title: 'El constructor no deshabilita los initializers', body: 'Ningún constructor llama _disableInitializers(): la implementación podría ser inicializada por cualquiera.', todo: 'Leé el estado de inicialización de la implementación on-chain.', fp: 'Se despliega sin proxy y se inicializa en la misma transacción.' },
  'unchecked-low-level-call': { title: 'Resultado de llamada de bajo nivel sin chequear', body: 'Se descarta el flag de éxito: si la llamada falla, la ejecución sigue como si hubiera funcionado.', todo: 'Revisá qué pasa con el estado si la llamada falla.', fp: 'La llamada es deliberadamente "best effort" (reembolsos, propinas).' },
  'arbitrary-transfer-from': { title: 'transferFrom con un remitente elegido por quien llama', body: 'El `from` viene directo del que llama y nunca se compara con msg.sender, un allowance o una firma: cualquiera podría mover tokens de quien haya aprobado este contrato.', todo: 'Confirmá quién puede pasar un `from` arbitrario. No apruebes más de lo que vas a gastar hasta tenerlo claro.', fp: 'El chequeo vive en un helper o modificador no reconocido, o solo llaman cuentas de confianza.' },
  'oracle-stale-price': { title: 'Precio de Chainlink sin chequeo de antigüedad', body: 'Si el feed se corta, el contrato sigue usando un precio viejo, explotable en préstamos y trading.', todo: 'Buscá un chequeo de heartbeat (block.timestamp - updatedAt) acá o en quien llama.', fp: 'La antigüedad se chequea en quien llama o en un circuit breaker aparte.' },
  'oracle-answer-unchecked': { title: 'Respuesta de Chainlink sin validar', body: 'Se usa el precio sin chequear que sea positivo; un int256 negativo convertido a uint256 da un precio enorme.', todo: 'Buscá un answer > 0 antes de usarlo.', fp: 'Quien llama lo valida, o el feed no puede devolver valores no positivos.' },
  'oracle-latest-answer': { title: 'Uso de latestAnswer() (deprecado)', body: 'latestAnswer() no devuelve timestamp, así que no se puede chequear la antigüedad.', todo: 'Usá latestRoundData() con chequeo de antigüedad.', fp: 'Un contrato que no es de Chainlink expone una función con el mismo nombre.' },
  'oracle-no-sequencer-check': { title: 'Sin chequeo del sequencer de la L2', body: 'En esta L2 los precios pueden quedar viejos mientras el sequencer está caído, y no se encontró el feed de uptime.', todo: 'Buscá el chequeo del sequencer uptime feed.', fp: 'El chequeo vive en otro contrato o con otro nombre.' },
  'selfdestruct': { title: 'selfdestruct', body: 'Desde Cancun solo borra código en la transacción de creación, pero igual envía todo el saldo de ETH.', todo: 'Revisá quién puede alcanzarlo y a dónde va el saldo.' },
  'delegatecall': { title: 'delegatecall', body: 'Ejecuta código externo sobre el storage y el saldo de este contrato.', todo: 'Revisá si el destino o los datos los puede controlar alguien no confiable.', fp: 'Infraestructura de proxy o multicall a sí mismo.' },
  'tx-origin': { title: 'Uso de tx.origin', body: 'Autorizar con tx.origin se puede eludir con un contrato malicioso con el que la víctima interactúe.', todo: 'Revisá el flujo de autorización que usa tx.origin.', fp: 'Usos de logging o reembolso de gas que no controlan acceso.' },
  'no-source': { title: 'Código no verificado: chequeos estáticos omitidos', body: 'No hay código verificado en Etherscan ni Sourcify, así que solo corrieron los chequeos on-chain.', todo: 'Tratalo como desconocido: pedí código verificado o una revisión manual.' },
  'parse-partial': { title: 'Código parseado solo en parte', body: 'El parser de Solidity reportó errores; pueden faltar hallazgos en este archivo.', todo: 'Revisá ese archivo a mano.' },
  'unverified-source': { title: 'Código no verificado', body: 'Los contratos sin verificar son difíciles de inspeccionar y pueden ocultar controles de admin o reglas de transferencia raras.', todo: 'No confíes solo en el escaneo rápido: pedí código verificado o una revisión manual.' },
  'admin-roles': { title: 'Tiene roles de administrador', body: 'Los admins podrían cambiar parámetros, dar roles, pausar o hacer acciones privilegiadas.', todo: 'Revisá owner y roles: ¿están renunciados, en multisig o con timelock?' },
  'mint-controls': { title: 'Puede emitir nuevo supply', body: 'Emitir más supply diluye a los holders o cambia la economía del token o colección.', todo: 'Revisá quién puede emitir, si hay tope y si se renunció a ese permiso.' },
  'pause-controls': { title: 'Puede pausar transferencias', body: 'Cuentas privilegiadas podrían frenar transferencias, depósitos o retiros.', todo: 'Revisá quién puede pausar y bajo qué política.' },
  'pause-controls:now': { title: 'Las transferencias están pausadas ahora', body: 'paused() devuelve true: hoy no se puede transferir.', todo: 'No compres ni deposites hasta saber por qué está pausado y quién puede reanudarlo.' },
  'blacklist-controls': { title: 'Puede bloquear direcciones', body: 'Wallets específicas podrían quedar sin poder transferir o usar el activo.', todo: 'Revisá quién controla la lista y si es esperable para este activo.' },
  'tax-controls': { title: 'Se pueden cambiar las comisiones', body: 'Las comisiones de compra, venta o transferencia pueden cambiar después del lanzamiento.', todo: 'Revisá los valores actuales, los máximos y quién puede cambiarlos.' },
  'trading-gates': { title: 'Se puede limitar el trading', body: 'Estos controles pueden restringir cuándo o cómo se transfiere el token.', todo: 'Revisá si son protecciones temporales de lanzamiento o controles permanentes.' },
  'known-issuer': { title: '{symbol} oficial de {issuer}', body: '{issuer} puede congelar direcciones, pausar, emitir y actualizar el contrato. Es esperable en una stablecoin regulada, pero estás confiando en el emisor.', todo: 'Tomalo como poderes del emisor, no como señal de estafa. Leé los términos de {issuer} si te importan los congelamientos.' },
  'impersonation': { title: 'No es el {symbol} oficial en esta red', body: 'Usa el símbolo {symbol} pero no es el contrato oficial. Las estafas copian símbolos conocidos; las versiones bridgeadas tampoco son el token oficial.', todo: 'Compará con la dirección oficial {address} antes de aceptarlo o comprarlo.' },
}

const PT: Record<string, Text> = {
  'upgradeable': { title: 'Contrato atualizável (proxy)', body: 'Quem controla os upgrades pode substituir a lógica depois que você depositar ou aprovar.', todo: 'Verifique quem controla os upgrades: multisig, timelock, governança ou uma única chave.', fp: 'É normal em muitos protocolos; o risco depende de quem controla o upgrade.' },
  'single-key-control': { title: 'Uma única chave pode atualizar este contrato sem atraso', body: 'Quem tiver essa chave pode mudar o comportamento do contrato na hora, sem tempo para os usuários saírem.', todo: 'Descubra quem tem essa chave e se a equipe se comprometeu com multisig ou timelock.', fp: 'Chaves em custódia MPC ou hardware aparecem como uma única EOA on-chain.' },
  'single-key-control:owner': { title: 'Uma única chave administra este contrato sem atraso', body: 'Quem tiver essa chave pode mudar parâmetros ou permissões na hora.', todo: 'Descubra quem tem essa chave e se a equipe se comprometeu com multisig ou timelock.', fp: 'Chaves em custódia MPC ou hardware aparecem como uma única EOA on-chain.' },
  'unprotected-privileged': { title: 'Função de admin sem controle de acesso', body: 'Altera estado, não tem modificador de acesso e nunca verifica msg.sender: qualquer um poderia chamá-la.', todo: 'Confirme se qualquer um realmente deveria poder chamá-la.', fp: 'Heurística por nome: pode ser pública de propósito ou a verificação está num helper com nome incomum.' },
  'unprotected-initializer': { title: 'Inicializador sem proteção', body: 'Pode ser chamado de fora sem modificador initializer nem verificação de quem chama: alguém poderia reinicializar e virar owner.', todo: 'Verifique se só pode rodar uma vez e se o proxy foi inicializado no mesmo deploy.', fp: 'Travas de uso único com nomes que a verificação não reconhece.' },
  'uups-unprotected-upgrade': { title: 'Upgrade UUPS sem verificação de quem chama', body: '_authorizeUpgrade não tem controle de acesso reconhecido: qualquer um poderia chamar upgradeToAndCall e substituir a lógica.', todo: 'Confirme que só um owner, papel ou timelock confiável passa nessa verificação.', fp: 'A verificação está num modificador ou helper com nome não reconhecido.' },
  'uups-no-upgrade-function': { title: 'Implementação UUPS sem upgradeTo / upgradeToAndCall', body: 'No UUPS a função de upgrade fica na implementação. Sem ela o proxy fica congelado, inclusive para uma correção de emergência.', todo: 'Confirme se congelar os upgrades foi intencional e como bugs seriam corrigidos.', fp: 'A equipe congelou de propósito ou a função tem nome fora do padrão.' },
  'uninitialized-instance': { title: 'O contrato não está inicializado', body: 'O slot Initializable do OpenZeppelin v5 vale 0: initialize() ainda pode ser chamado por qualquer um, e quem chamar primeiro vira owner.', todo: 'Leia de novo o slot da evidência com cast storage.', fp: 'Foi deixado sem inicializar de propósito até uma transação controlada.' },
  'uninitialized-implementation': { title: 'Implementação sem inicializar e com initializers habilitados', body: 'Qualquer um pode inicializar a implementação e ficar com ela. É grave se dali for possível alcançar delegatecall ou selfdestruct.', todo: 'Leia de novo o slot no endereço da implementação (veja a evidência).', fp: 'A implementação não tem lógica privilegiada alcançável após inicializar.' },
  'initializers-not-disabled': { title: 'O construtor não desabilita os initializers', body: 'Nenhum construtor chama _disableInitializers(): a implementação poderia ser inicializada por qualquer um.', todo: 'Leia o estado de inicialização da implementação on-chain.', fp: 'É implantado sem proxy e inicializado na mesma transação.' },
  'unchecked-low-level-call': { title: 'Resultado de chamada de baixo nível sem verificação', body: 'O flag de sucesso é descartado: se a chamada falhar, a execução continua como se tivesse funcionado.', todo: 'Verifique o que acontece com o estado se a chamada falhar.', fp: 'A chamada é deliberadamente "best effort" (reembolsos, gorjetas).' },
  'arbitrary-transfer-from': { title: 'transferFrom com remetente escolhido por quem chama', body: 'O `from` vem direto de quem chama e nunca é comparado com msg.sender, um allowance ou uma assinatura: qualquer um poderia mover tokens de quem aprovou este contrato.', todo: 'Confirme quem pode passar um `from` arbitrário. Não aprove mais do que vai gastar até ter isso claro.', fp: 'A verificação está num helper ou modificador não reconhecido, ou só contas confiáveis chamam.' },
  'oracle-stale-price': { title: 'Preço da Chainlink sem verificação de defasagem', body: 'Se o feed parar, o contrato segue usando um preço antigo, explorável em empréstimos e trading.', todo: 'Procure uma verificação de heartbeat (block.timestamp - updatedAt) aqui ou em quem chama.', fp: 'A defasagem é verificada em quem chama ou num circuit breaker separado.' },
  'oracle-answer-unchecked': { title: 'Resposta da Chainlink sem validação', body: 'O preço é usado sem verificar se é positivo; um int256 negativo convertido em uint256 vira um preço enorme.', todo: 'Procure um answer > 0 antes do uso.', fp: 'Quem chama valida, ou o feed não pode retornar valores não positivos.' },
  'oracle-latest-answer': { title: 'Uso de latestAnswer() (obsoleto)', body: 'latestAnswer() não retorna timestamp, então não dá para verificar a defasagem.', todo: 'Use latestRoundData() com verificação de defasagem.', fp: 'Um contrato que não é da Chainlink expõe uma função com o mesmo nome.' },
  'oracle-no-sequencer-check': { title: 'Sem verificação do sequencer da L2', body: 'Nesta L2 os preços podem ficar antigos enquanto o sequencer está fora, e o feed de uptime não foi encontrado.', todo: 'Procure a verificação do sequencer uptime feed.', fp: 'A verificação está em outro contrato ou com outro nome.' },
  'selfdestruct': { title: 'selfdestruct', body: 'Desde o Cancun só apaga o código na transação de criação, mas ainda envia todo o saldo de ETH.', todo: 'Verifique quem pode alcançá-lo e para onde vai o saldo.' },
  'delegatecall': { title: 'delegatecall', body: 'Executa código externo sobre o storage e o saldo deste contrato.', todo: 'Verifique se o destino ou os dados podem ser controlados por alguém não confiável.', fp: 'Infraestrutura de proxy ou multicall para si mesmo.' },
  'tx-origin': { title: 'Uso de tx.origin', body: 'Autorizar com tx.origin pode ser contornado por um contrato malicioso com que a vítima interaja.', todo: 'Revise o fluxo de autorização que usa tx.origin.', fp: 'Usos de log ou reembolso de gas que não controlam acesso.' },
  'no-source': { title: 'Código não verificado: verificações estáticas puladas', body: 'Não há código verificado no Etherscan nem no Sourcify, então só rodaram as verificações on-chain.', todo: 'Trate como desconhecido: peça código verificado ou uma revisão manual.' },
  'parse-partial': { title: 'Código analisado só em parte', body: 'O parser de Solidity reportou erros; podem faltar achados neste arquivo.', todo: 'Revise esse arquivo manualmente.' },
  'unverified-source': { title: 'Código não verificado', body: 'Contratos não verificados são difíceis de inspecionar e podem esconder controles de admin ou regras de transferência estranhas.', todo: 'Não confie só na varredura rápida: peça código verificado ou uma revisão manual.' },
  'admin-roles': { title: 'Tem papéis de administrador', body: 'Admins poderiam mudar parâmetros, conceder papéis, pausar ou fazer ações privilegiadas.', todo: 'Verifique owner e papéis: foram renunciados, estão em multisig ou com timelock?' },
  'mint-controls': { title: 'Pode emitir novo supply', body: 'Emitir mais supply dilui os holders ou muda a economia do token ou coleção.', todo: 'Verifique quem pode emitir, se há teto e se essa permissão foi renunciada.' },
  'pause-controls': { title: 'Pode pausar transferências', body: 'Contas privilegiadas poderiam parar transferências, depósitos ou saques.', todo: 'Verifique quem pode pausar e sob qual política.' },
  'pause-controls:now': { title: 'As transferências estão pausadas agora', body: 'paused() retorna true: hoje não dá para transferir.', todo: 'Não compre nem deposite até saber por que está pausado e quem pode retomar.' },
  'blacklist-controls': { title: 'Pode bloquear endereços', body: 'Carteiras específicas poderiam ficar impedidas de transferir ou usar o ativo.', todo: 'Verifique quem controla a lista e se isso é esperado para este ativo.' },
  'tax-controls': { title: 'As taxas podem ser alteradas', body: 'As taxas de compra, venda ou transferência podem mudar depois do lançamento.', todo: 'Verifique os valores atuais, os máximos e quem pode alterá-los.' },
  'trading-gates': { title: 'O trading pode ser limitado', body: 'Esses controles podem restringir quando ou como o token é transferido.', todo: 'Verifique se são proteções temporárias de lançamento ou controles permanentes.' },
  'known-issuer': { title: '{symbol} oficial da {issuer}', body: 'A {issuer} pode congelar endereços, pausar, emitir e atualizar o contrato. É esperado numa stablecoin regulada, mas você está confiando no emissor.', todo: 'Trate como poderes do emissor, não como sinal de golpe. Leia os termos da {issuer} se congelamentos importam para você.' },
  'impersonation': { title: 'Não é o {symbol} oficial nesta rede', body: 'Usa o símbolo {symbol} mas não é o contrato oficial. Golpes copiam símbolos conhecidos; versões em bridge também não são o token oficial.', todo: 'Compare com o endereço oficial {address} antes de aceitar ou comprar.' },
}

const DICTS: Record<Lang, Record<string, Text>> = { es: ES, pt: PT }

function variant(warning: ProfileWarning): string {
  if (warning.id === 'single-key-control' && !/upgrade/.test(warning.title)) return 'single-key-control:owner'
  if (warning.id === 'pause-controls' && /paused right now/.test(warning.title)) return 'pause-controls:now'
  return warning.id
}

function params(warning: ProfileWarning): Record<string, string> {
  const all = `${warning.title} ${warning.body} ${warning.recommendation}`
  return {
    symbol: /(?:Official|official) (\S+)/.exec(warning.title)?.[1] ?? '',
    issuer: /^Official \S+ by (.+)$/.exec(warning.title)?.[1] ?? /not (\S+)'s official/.exec(all)?.[1] ?? '',
    address: /0x[0-9a-fA-F]{40}/.exec(warning.recommendation)?.[0] ?? '',
  }
}

const fill = (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '')

export function localizeWarning(warning: ProfileWarning, lang: string): ProfileWarning {
  const text = DICTS[lang as Lang]?.[variant(warning)]
  if (!text) return warning
  const values = params(warning)
  // keep the subject of the English title: "...: Contract.fn" or "... in Contract.fn"
  const subject = /(?::\s|\sin\s)(\S+)$/.exec(warning.title)?.[1]
  return {
    ...warning,
    title: fill(text.title, values) + (subject ? `: ${subject}` : ''),
    body: fill(text.body, values),
    recommendation: fill(text.todo, values),
    ...(warning.falsePositive && text.fp ? { falsePositive: text.fp } : {}),
  }
}

// Phrases produced by the "who controls" resolver.
const CONTROL_PHRASES: Record<Lang, Array<[RegExp, string]>> = {
  es: [
    [/single key \(EOA with EIP-7702 delegation\)/g, 'una sola clave (EOA con delegación EIP-7702)'],
    [/single key \(EOA\)/g, 'una sola clave (EOA)'],
    [/module\(s\) can act without signers/g, 'módulo(s) pueden actuar sin firmantes'],
    [/timelock, min delay/g, 'timelock, demora mínima'],
    [/timelock, delay/g, 'timelock, demora'],
    [/Aragon DAO \(permissions set by DAO votes\)/g, 'DAO de Aragon (permisos por votación)'],
    [/contract with an owner/g, 'contrato con owner'],
    [/contract with unrecognized control logic/g, 'contrato con lógica de control no reconocida'],
    [/renounced \(0x0\)/g, 'renunciado (0x0)'],
    [/total delay/g, 'demora total'],
    [/delay set by governance votes/g, 'demora definida por gobernanza'],
    [/delay unknown/g, 'demora desconocida'],
    [/no delay/g, 'sin demora'],
  ],
  pt: [
    [/single key \(EOA with EIP-7702 delegation\)/g, 'uma única chave (EOA com delegação EIP-7702)'],
    [/single key \(EOA\)/g, 'uma única chave (EOA)'],
    [/module\(s\) can act without signers/g, 'módulo(s) podem agir sem signatários'],
    [/timelock, min delay/g, 'timelock, atraso mínimo'],
    [/timelock, delay/g, 'timelock, atraso'],
    [/Aragon DAO \(permissions set by DAO votes\)/g, 'DAO Aragon (permissões por votação)'],
    [/contract with an owner/g, 'contrato com owner'],
    [/contract with unrecognized control logic/g, 'contrato com lógica de controle não reconhecida'],
    [/renounced \(0x0\)/g, 'renunciado (0x0)'],
    [/total delay/g, 'atraso total'],
    [/delay set by governance votes/g, 'atraso definido pela governança'],
    [/delay unknown/g, 'atraso desconhecido'],
    [/no delay/g, 'sem atraso'],
  ],
}

export function localizeControl(summary: string, lang: string): string {
  return (CONTROL_PHRASES[lang as Lang] ?? []).reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), summary)
}
