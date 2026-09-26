/**
 * AC-consumer-constraints-30 covers: R19.
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../../..')
const ADR_DIR = path.join(ROOT, 'docs/04-adr')

/**
 * The text of the `## <heading>` section of an ADR, up to the next `## ` heading.
 */
function section(content: string, heading: string): string {
  const start = content.indexOf(`## ${heading}`)
  expect(start, `no "## ${heading}" section`).toBeGreaterThan(-1)
  const next = content.indexOf('\n## ', start + 1)
  return content.slice(start, next === -1 ? undefined : next)
}

describe('AC-consumer-constraints-30 covers: R19', () => {
  it('check-adr-structure passes', () => {
    expect(() =>
      execFileSync('node', [path.join(ROOT, 'scripts/check-adr-structure.mjs')], {
        cwd: ROOT,
        encoding: 'utf8',
      }),
    ).not.toThrow()
  })

  const ADR_FILE = readdirSync(ADR_DIR).find((f) => f.startsWith('0007-'))

  it('the ADR numbered 0007 is the release-topology record', () => {
    expect(ADR_FILE).toBe('0007-release-topology.md')
  })

  it('its Decision states the fixed pair and that this package versions independently, with the reason', () => {
    const content = readFileSync(path.join(ADR_DIR, ADR_FILE!), 'utf8')
    const context = section(content, 'Context')
    expect(context).toMatch(/`@navecss\/tokens` and `@navecss\/core` version together/)
    expect(context).toMatch(/`fixed`/)
    const decision = section(content, 'Decision')
    expect(decision).toMatch(/`@navecss\/stylelint-config` versions independently/)
    expect(decision).toMatch(/not added to the `fixed` group/)
    // The reason is carried in the record itself, not by pointer to another document.
    expect(decision).toMatch(/contract is with Stylelint/)
  })

  it('its revisit trigger names a peer dependency, never "a peer or dependency range"', () => {
    const content = readFileSync(path.join(ADR_DIR, ADR_FILE!), 'utf8')
    const trigger = content.slice(content.indexOf('**Revisit trigger:**'))
    expect(trigger).toMatch(/takes a peer dependency on that package/)
    expect(content).not.toMatch(/peer or dependency range/)
  })

  it('its Context says what keeps bridge and cli off npm: private: true, not the ignore list', () => {
    const context = section(
      readFileSync(path.join(ADR_DIR, ADR_FILE!), 'utf8'),
      'Context',
    ).replaceAll(/\s+/g, ' ')
    expect(context).toContain('"private": true')
    expect(context).toContain('governs versioning and tagging, not publishing')
  })

  it('the ADR index lists the new record', () => {
    const index = readFileSync(path.join(ADR_DIR, 'index.md'), 'utf8')
    expect(index).toMatch(/release topology/i)
  })
})
