# unfold — project memory

## Repo
https://github.com/alva-p/unfold

## Stack
- Node.js 18+ / TypeScript → tsup → `dist/index.cjs`
- CLI: commander + **@inquirer/prompts** (v13 — usar `select()` e `input()`, NO la vieja API `prompt([{type:'list'}])`)
- Terminal: chalk, ora, boxen, cli-table3
- EVM: viem para todos los RPC calls
- Source: Etherscan API **V2** (requiere key) + Sourcify **V2** fallback (sin key)
- AST: @solidity-parser/parser
- Tests: vitest

## Estado actual

Todas las fases implementadas y funcionando:

| Comando | Estado |
|---------|--------|
| `unfold` (sin args) | ✅ modo interactivo completo |
| `unfold <address>` | ✅ fingerprint + loop interactivo |
| `--proxy` | ✅ proxy chain + upgrade history |
| `--tree` | ✅ árbol de herencia + detección OZ |
| `--security` | ✅ scan superficie de ataque |
| `--read "fn()"` | ✅ llama view functions |
| `--storage <slot>` | ✅ lee storage slots, variables, mappings |
| `--watch <event>` | ✅ live event stream |
| `--export foundry\|abi\|json` | ✅ exporta artefactos |
| `--chain <name>` | ✅ 8 chains soportadas |
| `--json` | ✅ output JSON sin banner |
| `config init` | ✅ wizard ~/.unfold/config.json |
| EOA detection | ✅ balance + nonce |

## Bugs corregidos (no reintroducir)

- **ast-analyzer `nameOf()`**: el parser guarda herencia en `node.namePath`, no `node.name` (UserDefinedTypeName). Sin este fix el `--tree` no muestra los contratos padre.
- **Security scanner**: no usar blocklist de funciones — usar patrones de nombre (`set*`, `pause`, `upgrade`, `grant`, etc.). Las ERC-standard (`transfer`, `deposit`, etc.) son públicas por diseño.
- **proxy-detector `getLogs`**: usar formato ABI de viem (`event: { type, name, inputs }`), no `topics` raw.
- **inquirer v13**: usa `select()` e `input()` de `@inquirer/prompts`. La vieja API `prompt([{type:'list'}])` no renderiza las opciones.
- **Etherscan API**: V1 deprecated. Usar V2: `https://api.etherscan.io/v2/api?chainid=<id>&...`. Sin API key → caer a Sourcify.

## RPCs que funcionan (verificado 2026-05-20)

```
mainnet:   https://ethereum-rpc.publicnode.com
arbitrum:  https://arb1.arbitrum.io/rpc
base:      https://mainnet.base.org
optimism:  https://mainnet.optimism.io
polygon:   https://polygon-bor-rpc.publicnode.com
sepolia:   https://ethereum-sepolia-rpc.publicnode.com
holesky:   https://ethereum-holesky-rpc.publicnode.com
```

❌ `llamarpc.com` — SSL caído (526)
❌ `polygon-rpc.com` — API key desactivada

## Tests

```bash
npm test           # 42 unit tests — standards, storage-layout, ast-analyzer (~700ms, sin red)
npm run test:smoke # 9 integration tests — mainnet, base, arbitrum, sepolia (~15s, necesita red)
npm run typecheck  # tsc --noEmit
npm run build      # tsup → dist/index.cjs
```

## Instalado localmente

Symlink en `~/.local/bin/unfold → dist/index.cjs`. Correr `unfold` directamente en terminal.

## Lo que falta

### Para publicar en npm
- [ ] Verificar que el nombre `unfold` esté libre en npmjs.com
- [ ] Agregar `repository`, `homepage`, `bugs` en package.json
- [ ] `npm pack --dry-run` — confirmar que solo incluye `dist/`, `README.md`, `LICENSE`
- [ ] `npm publish`

### Features pendientes
- [ ] README: GIF demo del modo interactivo + tabla completa de flags
- [ ] Mejorar output visual de `--tree` y `--security`
- [ ] Diamond proxy: enumerar facets (ahora solo detecta el patrón)
- [ ] Storage avanzado: structs, packed variables, inheritance gaps
- [ ] `--read`: agregar soporte para arrays, tuples, overloaded functions
- [ ] `unfold config show` / `config set` / `config path`
- [ ] `--no-menu` y `--quiet` flags
- [ ] `--output <path>` para exports
- [ ] CI/CD con GitHub Actions
- [ ] Tests para read-call parser y proxy slot decoding
- [ ] Timeout handling para RPC calls lentos

## Reglas del repo
- No agregar `Co-Authored-By` en commits (repo público)
