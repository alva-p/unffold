import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { localizeControl, localizeWarning } from '../core/finding-i18n.js'
import type { ProfileWarning } from '../core/profile-report.js'

const warning = (id: string, title = 'English title', extra: Partial<ProfileWarning> = {}): ProfileWarning =>
  ({ id, title, severity: 'medium', body: 'English body', recommendation: 'English todo', ...extra })

describe('warning translations', () => {
  it('covers every documented detector in es and pt', () => {
    const ids = [...readFileSync(join(__dirname, '../../docs/detectors.md'), 'utf8').matchAll(/^### (\S+)/gm)].map(match => match[1])
    for (const lang of ['es', 'pt']) {
      const missing = ids.filter(id => localizeWarning(warning(id), lang).title === 'English title')
      expect(missing, lang).toEqual([])
    }
  })

  it('keeps the dynamic subject, location and evidence', () => {
    const out = localizeWarning(warning('unprotected-privileged', 'Privileged-looking function without access control: Vault.setFee', { location: 'Vault.sol:12', evidence: ['x'] }), 'es')
    expect(out).toMatchObject({ title: 'Función de admin sin control de acceso: Vault.setFee', location: 'Vault.sol:12', evidence: ['x'] })
  })

  it('fills issuer and impersonation parameters', () => {
    expect(localizeWarning(warning('known-issuer', 'Official USDC by Circle'), 'pt').title).toBe('USDC oficial da Circle')
    const fake = localizeWarning(warning('impersonation', 'Not the official USDC on this network', { recommendation: 'Compare with the official address 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 before accepting or buying it.' }), 'es')
    expect(fake.recommendation).toContain('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')
  })

  it('leaves English and unknown ids untouched, and translates control paths', () => {
    const original = warning('something-new')
    expect(localizeWarning(original, 'es')).toBe(original)
    expect(localizeWarning(warning('upgradeable'), 'en').title).toBe('English title')
    expect(localizeControl('contract with an owner → single key (EOA) · no delay', 'es')).toBe('contrato con owner → una sola clave (EOA) · sin demora')
  })
})
